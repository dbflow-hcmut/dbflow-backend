import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PlanEntity } from '@/modules/subscriptions/entity/plan.entity';
import { SubscriptionEntity } from '@/modules/subscriptions/entity/subscription.entity';
import {
  BillingCycle,
  PlanWorkspaceType,
  SubscriptionStatus,
} from '@/modules/subscriptions/subscription.enums';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import {
  WorkspaceMemberStatus,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from '@/modules/workspaces/workspace.enums';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { OrderStatus, PaymentTransactionStatus } from './billing.enums';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { OrderEntity } from './entity/order.entity';
import { PaymentTransactionEntity } from './entity/payment-transaction.entity';
import { PayOSService, PayOSWebhook } from './payos.service';
import { MailService } from '@/modules/mail/mail.service';

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private renewalTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(PlanEntity)
    private readonly plansRepo: Repository<PlanEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly workspaceMembersRepo: Repository<WorkspaceMemberEntity>,
    private readonly workspacesService: WorkspacesService,
    private readonly payosService: PayOSService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    void this.runRenewalJobs();
    this.renewalTimer = setInterval(
      () => void this.runRenewalJobs(),
      60 * 60 * 1000,
    );
    this.renewalTimer.unref();
  }

  onModuleDestroy() {
    if (this.renewalTimer) clearInterval(this.renewalTimer);
  }

  async createCheckout(userId: string, dto: CreateCheckoutDto) {
    const plan = await this.plansRepo.findOne({
      where: { code: dto.planCode, isActive: true },
      order: { version: 'DESC' },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    const workspace = dto.workspaceId
      ? await this.workspacesService.assertBillingPermission(
          userId,
          dto.workspaceId,
        )
      : null;
    const expectedType = workspace
      ? workspace.type === WorkspaceType.Team
        ? PlanWorkspaceType.Team
        : PlanWorkspaceType.Personal
      : PlanWorkspaceType.Team;
    if (
      plan.workspaceType !== expectedType &&
      plan.workspaceType !== PlanWorkspaceType.Any
    ) {
      throw new BadRequestException('Plan does not support this workspace');
    }
    if (workspace) {
      const currentSubscription = await this.dataSource
        .getRepository(SubscriptionEntity)
        .findOne({
          where: {
            workspaceId: workspace.id,
            status: In([
              SubscriptionStatus.Trialing,
              SubscriptionStatus.Active,
              SubscriptionStatus.PastDue,
            ]),
          },
          relations: ['plan'],
          order: { createdAt: 'DESC' },
        });
      if (
        currentSubscription &&
        plan.displayOrder < currentSubscription.plan.displayOrder
      ) {
        throw new BadRequestException(
          'Cannot purchase a plan lower than the current plan',
        );
      }
    }
    if (!workspace && !dto.workspaceName?.trim()) {
      throw new BadRequestException('Workspace name is required');
    }
    if (
      ![BillingCycle.Monthly, BillingCycle.Yearly].includes(dto.billingCycle)
    ) {
      throw new BadRequestException('Unsupported billing cycle');
    }
    const quantity =
      expectedType === PlanWorkspaceType.Team
        ? Math.max(dto.quantity, plan.includedSeats)
        : 1;
    const amount = this.calculateAmount(plan, dto.billingCycle, quantity);
    if (amount <= 0)
      throw new BadRequestException('Plan does not require payment');

    const payosOrderCode = Date.now() * 1000 + crypto.randomInt(100, 999);
    const order = await this.ordersRepo.save(
      this.ordersRepo.create({
        orderNumber: `DBF-${payosOrderCode}`,
        payosOrderCode: String(payosOrderCode),
        workspaceId: workspace?.id ?? null,
        workspaceName: workspace ? null : dto.workspaceName!.trim(),
        createdBy: userId,
        planId: plan.id,
        billingCycle: dto.billingCycle,
        quantity,
        amount: String(amount),
        currency: 'VND',
        status: OrderStatus.Pending,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }),
    );

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const backendUrl =
        process.env.BACKEND_URL ||
        `http://localhost:${process.env.PORT || '3000'}`;
      const link = await this.payosService.createPaymentLink({
        orderCode: payosOrderCode,
        amount,
        description: `DBFLOW ${payosOrderCode}`,
        itemName: `${plan.name} ${dto.billingCycle}`,
        returnUrl: `${frontendUrl}/billing/success?order=${order.orderNumber}`,
        cancelUrl: `${backendUrl}/billing/checkout/cancel`,
      });
      order.paymentLinkId = link.paymentLinkId;
      order.checkoutUrl = link.checkoutUrl;
      await this.ordersRepo.save(order);
      return order;
    } catch (error) {
      order.status = OrderStatus.Failed;
      await this.ordersRepo.save(order);
      throw error;
    }
  }

  async listOrders(userId: string, workspaceId: string) {
    await this.workspacesService.assertBillingPermission(userId, workspaceId);
    return this.ordersRepo.find({
      where: { workspaceId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });
  }

  async confirmCheckoutCancel(orderCode: string) {
    if (!orderCode) throw new BadRequestException('orderCode is required');
    const order = await this.ordersRepo.findOne({
      where: { payosOrderCode: orderCode },
    });
    if (!order) throw new NotFoundException('Order not found');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/billing/cancel?order=${encodeURIComponent(order.orderNumber)}`;
    if (order.status === OrderStatus.Canceled) return redirectUrl;
    if (order.status !== OrderStatus.Pending) {
      throw new BadRequestException('Only pending orders can be canceled');
    }

    const paymentLink = await this.payosService.getPaymentLink(orderCode);
    if (paymentLink.status !== 'CANCELLED') {
      throw new BadRequestException('Payment is not canceled on PayOS');
    }

    order.status = OrderStatus.Canceled;
    order.checkoutUrl = null;
    await this.ordersRepo.save(order);
    return redirectUrl;
  }

  async cancelOrder(userId: string, workspaceId: string, orderId: string) {
    await this.workspacesService.assertBillingPermission(userId, workspaceId);
    return this.cancelRenewalOrder(orderId, workspaceId);
  }

  async createRenewalOrder(subscriptionId: string) {
    const subscription = await this.dataSource
      .getRepository(SubscriptionEntity)
      .findOne({
        where: { id: subscriptionId },
        relations: ['plan', 'workspace', 'workspace.owner'],
      });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status !== SubscriptionStatus.Active) {
      throw new BadRequestException('Only active subscriptions can renew');
    }
    if (
      ![BillingCycle.Monthly, BillingCycle.Yearly].includes(
        subscription.billingCycle,
      )
    ) {
      throw new BadRequestException('Unsupported renewal billing cycle');
    }
    if (!subscription.workspace?.ownerUserId) {
      throw new BadRequestException('Workspace owner is required');
    }
    const amount = this.calculateAmount(
      subscription.plan,
      subscription.billingCycle,
      subscription.quantity,
    );
    if (amount <= 0) {
      throw new BadRequestException('Free subscriptions do not need renewal');
    }

    const existing = await this.ordersRepo.findOne({
      where: {
        subscriptionId: subscription.id,
        renewalPeriodStart: subscription.currentPeriodEnd,
      },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.status !== OrderStatus.Canceled) return existing;

    const renewalEnd = this.addBillingPeriod(
      subscription.currentPeriodEnd,
      subscription.billingCycle,
    );
    const payosOrderCode = Date.now() * 1000 + crypto.randomInt(100, 999);
    let order: OrderEntity;
    try {
      order = await this.ordersRepo.save(
        this.ordersRepo.create({
          orderNumber: `DBF-${payosOrderCode}`,
          payosOrderCode: String(payosOrderCode),
          workspaceId: subscription.workspaceId,
          workspaceName: null,
          createdBy: subscription.workspace.ownerUserId,
          planId: subscription.planId,
          subscriptionId: subscription.id,
          renewalPeriodStart: subscription.currentPeriodEnd,
          renewalPeriodEnd: renewalEnd,
          billingCycle: subscription.billingCycle,
          quantity: subscription.quantity,
          amount: String(amount),
          currency: 'VND',
          status: OrderStatus.Pending,
          expiresAt: subscription.currentPeriodEnd,
        }),
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const raced = await this.ordersRepo.findOne({
          where: {
            subscriptionId: subscription.id,
            renewalPeriodStart: subscription.currentPeriodEnd,
          },
          order: { createdAt: 'DESC' },
        });
        if (raced) return raced;
      }
      throw error;
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const backendUrl =
        process.env.BACKEND_URL ||
        `http://localhost:${process.env.PORT || '3000'}`;
      const link = await this.payosService.createPaymentLink({
        orderCode: payosOrderCode,
        amount,
        description: `DBFLOW ${payosOrderCode}`,
        itemName: `${subscription.plan.name} renewal`,
        returnUrl: `${frontendUrl}/billing/success?order=${order.orderNumber}`,
        cancelUrl: `${backendUrl}/billing/checkout/cancel`,
        expiresAt: subscription.currentPeriodEnd,
      });
      order.paymentLinkId = link.paymentLinkId;
      order.checkoutUrl = link.checkoutUrl;
      const saved = await this.ordersRepo.save(order);
      await this.sendRenewalBillEmails(saved, subscription);
      return saved;
    } catch (error) {
      order.status = OrderStatus.Failed;
      await this.ordersRepo.save(order);
      throw error;
    }
  }

  async cancelRenewalOrder(orderId: string, workspaceId?: string) {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (workspaceId && order.workspaceId !== workspaceId) {
      throw new ForbiddenException('Order does not belong to this workspace');
    }
    if (!order.subscriptionId) {
      throw new BadRequestException('Only renewal bills can be canceled');
    }
    if (![OrderStatus.Pending, OrderStatus.Failed].includes(order.status)) {
      throw new BadRequestException('Only open bills can be canceled');
    }
    order.status = OrderStatus.Canceled;
    order.checkoutUrl = null;
    await this.ordersRepo.save(order);
    await this.dataSource
      .getRepository(SubscriptionEntity)
      .update({ id: order.subscriptionId }, { cancelAtPeriodEnd: true });
    return order;
  }

  async runRenewalJobs() {
    try {
      await this.expirePendingBills();
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const subscriptions = await this.dataSource
        .getRepository(SubscriptionEntity)
        .find({
          where: {
            status: SubscriptionStatus.Active,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: Between(now, windowEnd),
          },
          relations: ['plan'],
        });
      for (const subscription of subscriptions) {
        if (
          this.calculateAmount(
            subscription.plan,
            subscription.billingCycle,
            subscription.quantity,
          ) <= 0
        )
          continue;
        try {
          await this.createRenewalOrder(subscription.id);
        } catch {
          // A failed provider call is recorded on the order and retried manually.
        }
      }
    } catch {
      // Keep the application available; the next hourly run retries the job.
    }
  }

  private async expirePendingBills() {
    const expired = await this.ordersRepo.find({
      where: {
        status: OrderStatus.Pending,
        expiresAt: LessThanOrEqual(new Date()),
      },
    });
    for (const order of expired) {
      order.status = OrderStatus.Canceled;
      order.checkoutUrl = null;
    }
    if (expired.length) await this.ordersRepo.save(expired);
  }

  private async sendRenewalBillEmails(
    order: OrderEntity,
    subscription: SubscriptionEntity,
  ) {
    if (!order.checkoutUrl || !order.expiresAt) return;
    const billingMembers = await this.workspaceMembersRepo.find({
      where: {
        workspaceId: subscription.workspaceId,
        role: WorkspaceRole.Billing,
        status: WorkspaceMemberStatus.Active,
      },
      relations: ['user'],
    });
    const recipients = new Map<string, { email: string; fullName: string }>();
    const owner = subscription.workspace.owner;
    if (owner?.email) {
      recipients.set(owner.email.toLowerCase(), {
        email: owner.email,
        fullName: owner.fullName,
      });
    }
    for (const member of billingMembers) {
      if (member.user?.email) {
        recipients.set(member.user.email.toLowerCase(), {
          email: member.user.email,
          fullName: member.user.fullName,
        });
      }
    }
    await Promise.all(
      [...recipients.values()].map((recipient) =>
        this.mailService.sendRenewalBillEmail({
          to: recipient.email,
          recipientName: recipient.fullName,
          workspaceName: subscription.workspace.name,
          planName: subscription.plan.name,
          amount: order.amount,
          currency: order.currency,
          expiresAt: order.expiresAt!,
          checkoutUrl: order.checkoutUrl!,
        }),
      ),
    );
  }

  async processWebhook(payload: PayOSWebhook) {
    if (!this.payosService.verifyWebhook(payload)) {
      throw new BadRequestException('Invalid PayOS webhook signature');
    }
    if (!payload.success || payload.data.code !== '00') {
      return { success: true };
    }
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(OrderEntity);
      const transactionRepo = manager.getRepository(PaymentTransactionEntity);
      const subscriptionRepo = manager.getRepository(SubscriptionEntity);
      const order = await orderRepo.findOne({
        where: { payosOrderCode: String(payload.data.orderCode) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) return { success: true };
      if ([OrderStatus.Canceled, OrderStatus.Expired].includes(order.status)) {
        return { success: true };
      }
      if (
        Number(order.amount) !== payload.data.amount ||
        order.currency !== payload.data.currency
      ) {
        throw new BadRequestException('PayOS amount or currency mismatch');
      }
      if (order.status === OrderStatus.Paid) return { success: true };

      const existingTransaction = await transactionRepo.findOne({
        where: { providerTransactionId: payload.data.reference },
      });
      if (!existingTransaction) {
        await transactionRepo.save(
          transactionRepo.create({
            orderId: order.id,
            provider: 'payos',
            providerTransactionId: payload.data.reference,
            amount: String(payload.data.amount),
            currency: payload.data.currency,
            status: PaymentTransactionStatus.Succeeded,
            rawPayload: payload as unknown as Record<string, unknown>,
          }),
        );
      }
      order.status = OrderStatus.Paid;
      order.paidAt = new Date();
      order.paymentLinkId = payload.data.paymentLinkId;
      await orderRepo.save(order);

      let workspaceId = order.workspaceId;
      if (!workspaceId) {
        const workspaceRepo = manager.getRepository(WorkspaceEntity);
        const memberRepo = manager.getRepository(WorkspaceMemberEntity);
        const workspace = await workspaceRepo.save(
          workspaceRepo.create({
            type: WorkspaceType.Team,
            name: order.workspaceName || 'My Team',
            slug: `team-${crypto.randomUUID().slice(0, 12)}`,
            ownerUserId: order.createdBy,
            status: WorkspaceStatus.Active,
          }),
        );
        await memberRepo.save(
          memberRepo.create({
            workspaceId: workspace.id,
            userId: order.createdBy,
            role: WorkspaceRole.Owner,
            status: WorkspaceMemberStatus.Active,
          }),
        );
        workspaceId = workspace.id;
        order.workspaceId = workspace.id;
        await orderRepo.save(order);
      }

      let subscription = order.subscriptionId
        ? await subscriptionRepo.findOne({
            where: { id: order.subscriptionId },
          })
        : await subscriptionRepo.findOne({
            where: { workspaceId },
            order: { createdAt: 'DESC' },
          });
      if (!subscription) {
        subscription = subscriptionRepo.create({ workspaceId });
      }
      const start = order.renewalPeriodStart ?? new Date();
      const end =
        order.renewalPeriodEnd ??
        this.addBillingPeriod(start, order.billingCycle);
      subscription.planId = order.planId;
      subscription.status = SubscriptionStatus.Active;
      subscription.billingCycle = order.billingCycle;
      subscription.quantity = order.quantity;
      subscription.provider = 'payos';
      subscription.providerSubscriptionId = null;
      subscription.currentPeriodStart = start;
      subscription.currentPeriodEnd = end;
      subscription.cancelAtPeriodEnd = false;
      await subscriptionRepo.save(subscription);
      return { success: true };
    });
  }

  private calculateAmount(
    plan: PlanEntity,
    cycle: BillingCycle,
    quantity: number,
  ) {
    const yearly = cycle === BillingCycle.Yearly;
    const base = Number(yearly ? plan.yearlyBasePrice : plan.monthlyBasePrice);
    const seatPrice = Number(
      (yearly ? plan.yearlySeatPrice : plan.monthlySeatPrice) ?? 0,
    );
    return Math.round(
      base + Math.max(0, quantity - plan.includedSeats) * seatPrice,
    );
  }

  private addBillingPeriod(start: Date, cycle: BillingCycle) {
    const end = new Date(start);
    if (cycle === BillingCycle.Yearly) {
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    } else {
      end.setUTCMonth(end.getUTCMonth() + 1);
    }
    return end;
  }
}
