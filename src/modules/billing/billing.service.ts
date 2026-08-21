import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import * as crypto from 'crypto';
import Stripe = require('stripe');
import { PlanEntity } from '@/modules/subscriptions/entity/plan.entity';
import { SubscriptionEntity } from '@/modules/subscriptions/entity/subscription.entity';
import { BillingCycle, PlanWorkspaceType, SubscriptionStatus } from '@/modules/subscriptions/subscription.enums';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { WorkspaceMemberStatus, WorkspaceRole, WorkspaceStatus, WorkspaceType } from '@/modules/workspaces/workspace.enums';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { OrderStatus, PaymentTransactionStatus } from './billing.enums';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { OrderEntity } from './entity/order.entity';
import { PaymentTransactionEntity } from './entity/payment-transaction.entity';
import { StripeService } from './stripe.service';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(OrderEntity) private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(PlanEntity) private readonly plansRepo: Repository<PlanEntity>,
    private readonly workspacesService: WorkspacesService,
    private readonly stripeService: StripeService,
    private readonly dataSource: DataSource,
  ) {}

  async createCheckout(userId: string, dto: CreateCheckoutDto) {
    const plan = await this.plansRepo.findOne({ where: { code: dto.planCode, isActive: true }, order: { version: 'DESC' } });
    if (!plan) throw new NotFoundException('Plan not found');
    const workspace = dto.workspaceId
      ? await this.workspacesService.assertBillingPermission(userId, dto.workspaceId)
      : null;
    const expectedType = workspace
      ? workspace.type === WorkspaceType.Team ? PlanWorkspaceType.Team : PlanWorkspaceType.Personal
      : PlanWorkspaceType.Team;
    if (plan.workspaceType !== expectedType && plan.workspaceType !== PlanWorkspaceType.Any) {
      throw new BadRequestException('Plan does not support this workspace');
    }
    if (!workspace && !dto.workspaceName?.trim()) throw new BadRequestException('Workspace name is required');
    if (![BillingCycle.Monthly, BillingCycle.Yearly].includes(dto.billingCycle)) {
      throw new BadRequestException('Unsupported billing cycle');
    }

    let currentSubscription: SubscriptionEntity | null = null;
    if (workspace) {
      currentSubscription = await this.dataSource.getRepository(SubscriptionEntity).findOne({
        where: { workspaceId: workspace.id, status: In([SubscriptionStatus.Trialing, SubscriptionStatus.Active, SubscriptionStatus.PastDue]) },
        relations: ['plan'],
        order: { createdAt: 'DESC' },
      });
      if (currentSubscription && plan.displayOrder < currentSubscription.plan.displayOrder) {
        throw new BadRequestException('Cannot purchase a plan lower than the current plan');
      }
      if (currentSubscription?.provider === 'stripe' && currentSubscription.providerSubscriptionId) {
        throw new BadRequestException('This workspace already has a Stripe subscription. Manage it from the billing portal.');
      }
    }

    const quantity = expectedType === PlanWorkspaceType.Team ? Math.max(dto.quantity, plan.includedSeats) : 1;
    const amount = this.calculateAmount(plan, dto.billingCycle, quantity);
    if (amount <= 0) throw new BadRequestException('Plan does not require payment');
    const order = await this.ordersRepo.save(this.ordersRepo.create({
      orderNumber: `DBF-${Date.now()}-${crypto.randomInt(100, 999)}`,
      providerCheckoutId: null,
      providerInvoiceId: null,
      workspaceId: workspace?.id ?? null,
      workspaceName: workspace ? null : dto.workspaceName!.trim(),
      createdBy: userId,
      planId: plan.id,
      subscriptionId: null,
      renewalPeriodStart: null,
      renewalPeriodEnd: null,
      billingCycle: dto.billingCycle,
      quantity,
      amount: String(amount),
      currency: 'VND',
      status: OrderStatus.Pending,
      paymentLinkId: null,
      checkoutUrl: null,
      paidAt: null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }));

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const session = await this.stripeService.stripe.checkout.sessions.create({
        mode: 'subscription',
        success_url: `${frontendUrl}/billing/success?order=${encodeURIComponent(order.orderNumber)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/billing/cancel?order=${encodeURIComponent(order.orderNumber)}`,
        customer: currentSubscription?.providerCustomerId || undefined,
        client_reference_id: order.id,
        line_items: [{ quantity: 1, price_data: {
          currency: 'vnd',
          unit_amount: amount,
          recurring: { interval: dto.billingCycle === BillingCycle.Yearly ? 'year' : 'month' },
          product_data: { name: `DBFlow ${plan.name}` },
        } }],
        subscription_data: { metadata: { orderId: order.id } },
        metadata: { orderId: order.id },
      });
      order.providerCheckoutId = session.id;
      order.paymentLinkId = session.id;
      order.checkoutUrl = session.url;
      order.expiresAt = new Date(session.expires_at * 1000);
      return this.ordersRepo.save(order);
    } catch (error) {
      order.status = OrderStatus.Failed;
      await this.ordersRepo.save(order);
      throw error;
    }
  }

  async listOrders(userId: string, workspaceId: string) {
    await this.workspacesService.assertBillingPermission(userId, workspaceId);
    try {
      await this.reconcileWorkspaceInvoices(workspaceId);
    } catch {
      // Keep local billing history available when Stripe is temporarily unavailable.
    }
    return this.ordersRepo.find({ where: { workspaceId }, relations: ['plan'], order: { createdAt: 'DESC' } });
  }

  async cancelOrder(userId: string, workspaceId: string, orderId: string) {
    await this.workspacesService.assertBillingPermission(userId, workspaceId);
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.workspaceId !== workspaceId) throw new ForbiddenException('Order does not belong to this workspace');
    if (order.status !== OrderStatus.Pending) throw new BadRequestException('Only pending checkouts can be canceled');
    if (order.providerCheckoutId) await this.stripeService.stripe.checkout.sessions.expire(order.providerCheckoutId);
    order.status = OrderStatus.Canceled;
    order.checkoutUrl = null;
    return this.ordersRepo.save(order);
  }

  async createBillingPortal(userId: string, workspaceId: string) {
    await this.workspacesService.assertBillingPermission(userId, workspaceId);
    const subscription = await this.dataSource.getRepository(SubscriptionEntity).findOne({
      where: { workspaceId, provider: 'stripe' }, order: { createdAt: 'DESC' },
    });
    if (!subscription?.providerCustomerId) throw new NotFoundException('Stripe customer not found');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.stripeService.stripe.billingPortal.sessions.create({
      customer: subscription.providerCustomerId,
      return_url: `${frontendUrl}/pricing`,
    });
  }

  async processWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripeService.constructWebhookEvent(rawBody, signature);
    if (event.type === 'checkout.session.completed') await this.handleCheckoutCompleted(event.data.object);
    else if (event.type === 'invoice.created' || event.type === 'invoice.finalized') await this.handleInvoiceChanged(event.data.object, false);
    else if (event.type === 'invoice.paid') await this.handleInvoicePaid(event.data.object);
    else if (event.type === 'invoice.payment_failed') await this.updateSubscriptionFromInvoice(event.data.object, SubscriptionStatus.PastDue);
    else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') await this.syncStripeSubscription(event.data.object);
    return { received: true };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.orderId || session.client_reference_id;
    const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!orderId || !stripeSubscriptionId) return;
    const stripeSubscription = await this.stripeService.stripe.subscriptions.retrieve(stripeSubscriptionId);
    await this.dataSource.transaction(async (manager) => {
      const subscription = await this.ensureLocalSubscription(manager, stripeSubscription);
      if (!subscription) return;
      const orderRepo = manager.getRepository(OrderEntity);
      const order = await orderRepo.findOne({ where: { id: orderId } });
      if (!order) return;
      order.subscriptionId = subscription.id;
      order.providerCheckoutId = session.id;
      await orderRepo.save(order);
    });
    const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id;
    if (invoiceId) {
      const invoice = await this.stripeService.stripe.invoices.retrieve(invoiceId);
      await this.handleInvoiceChanged(invoice, invoice.status === 'paid');
    }
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    await this.handleInvoiceChanged(invoice, true);
  }

  private async handleInvoiceChanged(invoice: Stripe.Invoice, paid: boolean) {
    const providerSubscriptionId = this.invoiceSubscriptionId(invoice);
    if (!providerSubscriptionId) return;
    const stripeSubscription = await this.stripeService.stripe.subscriptions.retrieve(providerSubscriptionId);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [providerSubscriptionId],
      );
      const subscription = await this.ensureLocalSubscription(manager, stripeSubscription);
      if (!subscription) return;
      if (paid) {
        subscription.status = SubscriptionStatus.Active;
        await manager.getRepository(SubscriptionEntity).save(subscription);
      }
      const orderRepo = manager.getRepository(OrderEntity);
      const checkoutOrderId = stripeSubscription.metadata.orderId;
      let order = await orderRepo.findOne({ where: { providerInvoiceId: invoice.id } });
      order ??= checkoutOrderId
        ? await orderRepo.findOne({
            where: { id: checkoutOrderId, providerInvoiceId: IsNull() },
          })
        : null;
      order ??= await orderRepo.findOne({
        where: {
          subscriptionId: subscription.id,
          renewalPeriodStart: subscription.currentPeriodStart,
          status: Not(OrderStatus.Canceled),
        },
        order: { createdAt: 'ASC' },
      });
      if (!order) {
        order = orderRepo.create({
          orderNumber: `STRIPE-${invoice.number || invoice.id}`,
          providerCheckoutId: null,
          providerInvoiceId: invoice.id,
          workspaceId: subscription.workspaceId,
          workspaceName: null,
          createdBy: await this.workspaceOwnerId(manager, subscription.workspaceId),
          planId: subscription.planId,
          subscriptionId: subscription.id,
          renewalPeriodStart: subscription.currentPeriodStart,
          renewalPeriodEnd: subscription.currentPeriodEnd,
          billingCycle: subscription.billingCycle,
          quantity: subscription.quantity,
          amount: String(paid ? invoice.amount_paid : invoice.amount_due),
          currency: invoice.currency.toUpperCase(),
          status: paid ? OrderStatus.Paid : OrderStatus.Pending,
          paymentLinkId: invoice.id,
          checkoutUrl: invoice.hosted_invoice_url,
          paidAt: paid ? new Date() : null,
          expiresAt: null,
        });
      } else {
        order.providerInvoiceId = invoice.id;
        order.status = paid ? OrderStatus.Paid : OrderStatus.Pending;
        order.paidAt = paid ? new Date() : null;
        order.subscriptionId = subscription.id;
        order.renewalPeriodStart = subscription.currentPeriodStart;
        order.renewalPeriodEnd = subscription.currentPeriodEnd;
        order.amount = String(paid ? invoice.amount_paid : invoice.amount_due);
        order.paymentLinkId = invoice.id;
        order.checkoutUrl = invoice.hosted_invoice_url ?? null;
      }
      order = await orderRepo.save(order);
      if (!paid) return;
      const transactionRepo = manager.getRepository(PaymentTransactionEntity);
      if (!(await transactionRepo.findOne({ where: { providerTransactionId: invoice.id } }))) {
        await transactionRepo.save(transactionRepo.create({
          orderId: order.id,
          provider: 'stripe',
          providerTransactionId: invoice.id,
          amount: String(invoice.amount_paid),
          currency: invoice.currency.toUpperCase(),
          status: PaymentTransactionStatus.Succeeded,
          rawPayload: invoice as unknown as Record<string, unknown>,
        }));
      }
    });
  }

  private async updateSubscriptionFromInvoice(invoice: Stripe.Invoice, status: SubscriptionStatus) {
    const providerSubscriptionId = this.invoiceSubscriptionId(invoice);
    if (!providerSubscriptionId) return;
    await this.dataSource.transaction(async (manager) => {
      const stripeSubscription = await this.stripeService.stripe.subscriptions.retrieve(providerSubscriptionId);
      const subscription = await this.ensureLocalSubscription(manager, stripeSubscription);
      if (subscription) {
        subscription.status = status;
        await manager.getRepository(SubscriptionEntity).save(subscription);
      }
      const order = await manager.getRepository(OrderEntity).findOne({
        where: { providerInvoiceId: invoice.id },
      });
      if (order) {
        order.status = OrderStatus.Failed;
        await manager.getRepository(OrderEntity).save(order);
      }
    });
  }

  private async ensureLocalSubscription(
    manager: EntityManager,
    stripeSubscription: Stripe.Subscription,
  ) {
    const subscriptionRepo = manager.getRepository(SubscriptionEntity);
    let subscription = await subscriptionRepo.findOne({
      where: { providerSubscriptionId: stripeSubscription.id },
    });
    if (subscription) {
      this.applyStripeSubscription(subscription, stripeSubscription);
      return subscriptionRepo.save(subscription);
    }

    const checkoutOrderId = stripeSubscription.metadata.orderId;
    if (!checkoutOrderId) return null;
    const orderRepo = manager.getRepository(OrderEntity);
    const order = await orderRepo.findOne({ where: { id: checkoutOrderId } });
    if (!order) return null;

    let workspaceId = order.workspaceId;
    if (!workspaceId) {
      const workspaceRepo = manager.getRepository(WorkspaceEntity);
      const workspace = await workspaceRepo.save(workspaceRepo.create({
        type: WorkspaceType.Team,
        name: order.workspaceName || 'My Team',
        slug: `team-${crypto.randomUUID().slice(0, 12)}`,
        ownerUserId: order.createdBy,
        status: WorkspaceStatus.Active,
      }));
      const memberRepo = manager.getRepository(WorkspaceMemberEntity);
      await memberRepo.save(memberRepo.create({
        workspaceId: workspace.id,
        userId: order.createdBy,
        role: WorkspaceRole.Owner,
        status: WorkspaceMemberStatus.Active,
      }));
      workspaceId = workspace.id;
      order.workspaceId = workspace.id;
    }

    subscription = await subscriptionRepo.findOne({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    if (!subscription) subscription = subscriptionRepo.create({ workspaceId });
    this.applyStripeSubscription(subscription, stripeSubscription);
    subscription.planId = order.planId;
    subscription.billingCycle = order.billingCycle;
    subscription.quantity = order.quantity;
    subscription = await subscriptionRepo.save(subscription);
    order.subscriptionId = subscription.id;
    await orderRepo.save(order);
    return subscription;
  }

  private async syncStripeSubscription(stripeSubscription: Stripe.Subscription) {
    const repo = this.dataSource.getRepository(SubscriptionEntity);
    const subscription = await repo.findOne({ where: { providerSubscriptionId: stripeSubscription.id } });
    if (!subscription) return;
    this.applyStripeSubscription(subscription, stripeSubscription);
    await repo.save(subscription);
  }

  private async reconcileWorkspaceInvoices(workspaceId: string) {
    const subscription = await this.dataSource
      .getRepository(SubscriptionEntity)
      .findOne({
        where: { workspaceId, provider: 'stripe' },
        order: { createdAt: 'DESC' },
      });
    if (!subscription?.providerSubscriptionId) return;
    const invoices = await this.stripeService.stripe.invoices.list({
      subscription: subscription.providerSubscriptionId,
      limit: 24,
    });
    const orderedInvoices = [...invoices.data].sort(
      (left, right) => left.created - right.created,
    );
    for (const invoice of orderedInvoices) {
      if (invoice.status === 'paid') {
        await this.handleInvoiceChanged(invoice, true);
      } else if (invoice.status === 'draft' || invoice.status === 'open') {
        await this.handleInvoiceChanged(invoice, false);
      }
    }
  }

  private applyStripeSubscription(subscription: SubscriptionEntity, stripeSubscription: Stripe.Subscription) {
    const item = stripeSubscription.items.data[0];
    if (!item) throw new BadRequestException('Stripe subscription has no item');
    subscription.provider = 'stripe';
    subscription.providerCustomerId = typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : stripeSubscription.customer.id;
    subscription.providerSubscriptionId = stripeSubscription.id;
    subscription.currentPeriodStart = new Date(item.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(item.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
    subscription.canceledAt = stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null;
    subscription.status = this.mapStripeStatus(stripeSubscription.status);
  }

  private mapStripeStatus(status: Stripe.Subscription.Status) {
    if (status === 'active') return SubscriptionStatus.Active;
    if (status === 'trialing') return SubscriptionStatus.Trialing;
    if (status === 'past_due' || status === 'unpaid') return SubscriptionStatus.PastDue;
    if (status === 'paused') return SubscriptionStatus.Paused;
    if (status === 'canceled') return SubscriptionStatus.Canceled;
    return SubscriptionStatus.Expired;
  }

  private invoiceSubscriptionId(invoice: Stripe.Invoice) {
    const value = invoice.parent?.subscription_details?.subscription;
    return typeof value === 'string' ? value : value?.id;
  }

  private async workspaceOwnerId(manager: EntityManager, workspaceId: string) {
    const workspace = await manager.getRepository(WorkspaceEntity).findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace.ownerUserId;
  }

  private calculateAmount(plan: PlanEntity, cycle: BillingCycle, quantity: number) {
    const yearly = cycle === BillingCycle.Yearly;
    const base = Number(yearly ? plan.yearlyBasePrice : plan.monthlyBasePrice);
    const seatPrice = Number((yearly ? plan.yearlySeatPrice : plan.monthlySeatPrice) ?? 0);
    return Math.round(base + Math.max(0, quantity - plan.includedSeats) * seatPrice);
  }
}
