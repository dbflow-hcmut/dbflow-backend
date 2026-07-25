import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { UserStatus } from '@/common/enums/user-status.enum';
import { OrderEntity } from '@/modules/billing/entity/order.entity';
import { OrderStatus } from '@/modules/billing/billing.enums';
import { PlanEntity } from '@/modules/subscriptions/entity/plan.entity';
import { SubscriptionEntity } from '@/modules/subscriptions/entity/subscription.entity';
import { SubscriptionStatus } from '@/modules/subscriptions/subscription.enums';
import { UserEntity } from '@/modules/users/user.entity';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import { WorkspaceStatus } from '@/modules/workspaces/workspace.enums';
import { S3Service } from '@/modules/s3/s3.service';
import { resolveAvatarUrl } from '@/common/utils/avatar.util';
import { AdminAuditLogEntity } from './entity/admin-audit-log.entity';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { DbConnectionEntity } from '@/modules/db-connections/entity/db-connection.entity';
import { ExportRecordEntity } from '@/modules/export-records/entity/export-record.entity';
import {
  AdminSubscriptionAction,
  UpdateSubscriptionDto,
} from './dto/update-subscription.dto';
import {
  UsageEventEntity,
  UsageEventStatus,
} from '@/modules/usage/entity/usage-event.entity';
import { AiIngestionService } from '@/modules/ai-ingestion/ai-ingestion.service';

export type AnalyticsBucket = 'day' | 'week' | 'month';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspacesRepo: Repository<WorkspaceEntity>,
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionsRepo: Repository<SubscriptionEntity>,
    @InjectRepository(PlanEntity)
    private readonly plansRepo: Repository<PlanEntity>,
    @InjectRepository(AdminAuditLogEntity)
    private readonly auditRepo: Repository<AdminAuditLogEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepo: Repository<ProjectEntity>,
    @InjectRepository(DbConnectionEntity)
    private readonly dbConnRepo: Repository<DbConnectionEntity>,
    @InjectRepository(UsageEventEntity)
    private readonly usageEventsRepo: Repository<UsageEventEntity>,
    @InjectRepository(ExportRecordEntity)
    private readonly exportRepo: Repository<ExportRecordEntity>,
    private readonly s3Service: S3Service,
    private readonly aiIngestionService: AiIngestionService,
  ) {}

  async dashboard() {
    const [
      users,
      suspendedUsers,
      workspaces,
      subscriptions,
      paidOrders,
      pendingOrders,
    ] = await Promise.all([
      this.usersRepo.count(),
      this.usersRepo.count({ where: { status: UserStatus.Suspended } }),
      this.workspacesRepo.count(),
      this.subscriptionsRepo.count(),
      this.ordersRepo.count({ where: { status: OrderStatus.Paid } }),
      this.ordersRepo.count({ where: { status: OrderStatus.Pending } }),
    ]);
    const revenue = await this.ordersRepo
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.amount), 0)', 'total')
      .where('order.status = :status', { status: 'paid' })
      .getRawOne<{ total: string }>();
    return {
      users,
      suspendedUsers,
      workspaces,
      subscriptions,
      paidOrders,
      pendingOrders,
      revenueVnd: Number(revenue?.total ?? 0),
    };
  }

  private async seriesAndTotal(
    repo: Repository<{ createdAt: Date }>,
    alias: string,
    from: Date,
    to: Date,
    bucket: AnalyticsBucket,
    valueExpr: string,
    extraWhere?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<{ total: number; series: { period: string; value: number }[] }> {
    const dateFormat = bucket === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    let qb = repo
      .createQueryBuilder(alias)
      .where(`${alias}.createdAt BETWEEN :from AND :to`, { from, to });
    if (extraWhere) qb = qb.andWhere(extraWhere, extraParams);
    const rows = await qb
      .select(
        `TO_CHAR(DATE_TRUNC('${bucket}', ${alias}.createdAt), '${dateFormat}')`,
        'period',
      )
      .addSelect(valueExpr, 'value')
      .groupBy(`DATE_TRUNC('${bucket}', ${alias}.createdAt)`)
      .orderBy(`DATE_TRUNC('${bucket}', ${alias}.createdAt)`, 'ASC')
      .getRawMany<{ period: string; value: string }>();
    const series = rows.map((row) => ({
      period: row.period,
      value: Number(row.value),
    }));
    const total = series.reduce((sum, point) => sum + point.value, 0);
    return { total, series };
  }

  private async totalOnly(
    repo: Repository<{ createdAt: Date }>,
    alias: string,
    from: Date,
    to: Date,
    valueExpr: string,
    extraWhere?: string,
    extraParams?: Record<string, unknown>,
  ): Promise<number> {
    let qb = repo
      .createQueryBuilder(alias)
      .where(`${alias}.createdAt BETWEEN :from AND :to`, { from, to });
    if (extraWhere) qb = qb.andWhere(extraWhere, extraParams);
    const row = await qb
      .select(valueExpr, 'value')
      .getRawOne<{ value: string }>();
    return Number(row?.value ?? 0);
  }

  async overviewAnalytics(
    fromParam?: string,
    toParam?: string,
    bucketParam?: string,
  ) {
    const to = toParam ? new Date(toParam) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = fromParam
      ? new Date(fromParam)
      : new Date(to.getTime() - 29 * 86400000);
    from.setHours(0, 0, 0, 0);

    const spanMs = to.getTime() - from.getTime();
    const spanDays = spanMs / 86400000;
    const autoBucket: AnalyticsBucket =
      spanDays <= 31 ? 'day' : spanDays <= 180 ? 'week' : 'month';
    const bucket: AnalyticsBucket =
      bucketParam === 'day' || bucketParam === 'week' || bucketParam === 'month'
        ? bucketParam
        : autoBucket;

    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - spanMs);

    const [revenue, orders, newUsers, newSubscriptions] = await Promise.all([
      this.seriesAndTotal(
        this.ordersRepo,
        'order',
        from,
        to,
        bucket,
        'COALESCE(SUM(order.amount), 0)',
        'order.status = :status',
        { status: OrderStatus.Paid },
      ),
      this.seriesAndTotal(
        this.ordersRepo,
        'order',
        from,
        to,
        bucket,
        'COUNT(order.id)',
      ),
      this.seriesAndTotal(
        this.usersRepo,
        'usr',
        from,
        to,
        bucket,
        'COUNT(usr.id)',
      ),
      this.seriesAndTotal(
        this.subscriptionsRepo,
        'subscription',
        from,
        to,
        bucket,
        'COUNT(subscription.id)',
      ),
    ]);

    const [prevRevenue, prevOrders, prevNewUsers, prevNewSubscriptions] =
      await Promise.all([
        this.totalOnly(
          this.ordersRepo,
          'order',
          prevFrom,
          prevTo,
          'COALESCE(SUM(order.amount), 0)',
          'order.status = :status',
          { status: OrderStatus.Paid },
        ),
        this.totalOnly(
          this.ordersRepo,
          'order',
          prevFrom,
          prevTo,
          'COUNT(order.id)',
        ),
        this.totalOnly(
          this.usersRepo,
          'usr',
          prevFrom,
          prevTo,
          'COUNT(usr.id)',
        ),
        this.totalOnly(
          this.subscriptionsRepo,
          'subscription',
          prevFrom,
          prevTo,
          'COUNT(subscription.id)',
        ),
      ]);

    const changePct = (current: number, previous: number) => {
      if (previous === 0) return current === 0 ? 0 : 100;
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    const statusRows = await this.ordersRepo
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy('order.status')
      .getRawMany<{ status: OrderStatus; count: string }>();

    const orderStatusBreakdown = statusRows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));
    const totalOrdersInRange = orderStatusBreakdown.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    const paidOrdersInRange =
      orderStatusBreakdown.find((row) => row.status === OrderStatus.Paid)
        ?.count ?? 0;
    const paidOrderRate =
      totalOrdersInRange === 0
        ? 0
        : Number(((paidOrdersInRange / totalOrdersInRange) * 100).toFixed(1));

    // Token analytics come from provider usage metadata recorded per committed credit.
    const dateFormat = bucket === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const aiRows = await this.usageEventsRepo
      .createQueryBuilder('usage')
      .select(
        `TO_CHAR(DATE_TRUNC('${bucket}', usage.createdAt), '${dateFormat}')`,
        'period',
      )
      .addSelect('COUNT(usage.id)', 'credits')
      .addSelect('COALESCE(SUM(usage.modelCalls), 0)', 'modelCalls')
      .addSelect('COALESCE(SUM(usage.inputTokens), 0)', 'inputTokens')
      .addSelect('COALESCE(SUM(usage.outputTokens), 0)', 'outputTokens')
      .addSelect(`COALESCE(usage.modelName, 'Unknown')`, 'modelName')
      .where('usage.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere('usage.metric = :metric', { metric: 'ai_requests_monthly' })
      .andWhere('usage.status = :status', {
        status: UsageEventStatus.Committed,
      })
      .groupBy(`DATE_TRUNC('${bucket}', usage.createdAt)`)
      .addGroupBy('usage.modelName')
      .orderBy(`DATE_TRUNC('${bucket}', usage.createdAt)`, 'ASC')
      .getRawMany<{
        period: string;
        modelName: string;
        credits: string;
        modelCalls: string;
        inputTokens: string;
        outputTokens: string;
      }>();

    const toAiPoint = (row: (typeof aiRows)[number]) => ({
      period: row.period,
      credits: Number(row.credits),
      modelCalls: Number(row.modelCalls),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      totalTokens: Number(row.inputTokens) + Number(row.outputTokens),
    });
    const aiSeriesByPeriod = new Map<string, ReturnType<typeof toAiPoint>>();
    for (const row of aiRows) {
      const point = toAiPoint(row);
      const current = aiSeriesByPeriod.get(row.period);
      aiSeriesByPeriod.set(row.period, {
        period: row.period,
        credits: (current?.credits ?? 0) + point.credits,
        modelCalls: (current?.modelCalls ?? 0) + point.modelCalls,
        inputTokens: (current?.inputTokens ?? 0) + point.inputTokens,
        outputTokens: (current?.outputTokens ?? 0) + point.outputTokens,
        totalTokens: (current?.totalTokens ?? 0) + point.totalTokens,
      });
    }
    const aiSeries = [...aiSeriesByPeriod.values()];
    const buildModelSeries = (rows: typeof aiRows) =>
      [...new Set(rows.map((row) => row.modelName))].sort().map((modelName) => {
        const series = rows
          .filter((row) => row.modelName === modelName)
          .map(toAiPoint);
        return {
          modelName,
          totalCredits: series.reduce((sum, item) => sum + item.credits, 0),
          totalModelCalls: series.reduce(
            (sum, item) => sum + item.modelCalls,
            0,
          ),
          totalInputTokens: series.reduce(
            (sum, item) => sum + item.inputTokens,
            0,
          ),
          totalOutputTokens: series.reduce(
            (sum, item) => sum + item.outputTokens,
            0,
          ),
          totalTokens: series.reduce((sum, item) => sum + item.totalTokens, 0),
          series,
        };
      });
    const modelSeries = buildModelSeries(aiRows);
    const dailyModelRows =
      bucket === 'day'
        ? aiRows
        : await this.usageEventsRepo
            .createQueryBuilder('usage')
            .select(
              `TO_CHAR(DATE_TRUNC('day', usage.createdAt), 'YYYY-MM-DD')`,
              'period',
            )
            .addSelect('COUNT(usage.id)', 'credits')
            .addSelect('COALESCE(SUM(usage.modelCalls), 0)', 'modelCalls')
            .addSelect('COALESCE(SUM(usage.inputTokens), 0)', 'inputTokens')
            .addSelect('COALESCE(SUM(usage.outputTokens), 0)', 'outputTokens')
            .addSelect(`COALESCE(usage.modelName, 'Unknown')`, 'modelName')
            .where('usage.createdAt BETWEEN :from AND :to', { from, to })
            .andWhere('usage.metric = :metric', {
              metric: 'ai_requests_monthly',
            })
            .andWhere('usage.status = :status', {
              status: UsageEventStatus.Committed,
            })
            .groupBy(`DATE_TRUNC('day', usage.createdAt)`)
            .addGroupBy('usage.modelName')
            .orderBy(`DATE_TRUNC('day', usage.createdAt)`, 'ASC')
            .getRawMany<(typeof aiRows)[number]>();
    const dailyModelSeries = buildModelSeries(dailyModelRows);

    // Real DB Connection DBMS Breakdown
    const dbEngineRows = await this.dbConnRepo
      .createQueryBuilder('conn')
      .select('conn.dbms', 'dbms')
      .addSelect('COUNT(conn.id)', 'count')
      .groupBy('conn.dbms')
      .getRawMany<{ dbms: string; count: string }>();

    const dbEngines = dbEngineRows.map((row) => ({
      name: row.dbms,
      count: Number(row.count),
    }));

    // Real Active Subscriptions by Plan Distribution
    const planRows = await this.subscriptionsRepo
      .createQueryBuilder('sub')
      .innerJoin('sub.plan', 'plan')
      .select('plan.name', 'planName')
      .addSelect('COUNT(sub.id)', 'count')
      .groupBy('plan.name')
      .getRawMany<{ planName: string; count: string }>();

    const planDistribution = planRows.map((row) => ({
      planName: row.planName ?? 'Unknown',
      count: Number(row.count),
    }));

    // Real Projects & Export Records counts
    const totalProjects = await this.projectsRepo.count();
    const totalExports = await this.exportRepo.count();

    return {
      range: { from: from.toISOString(), to: to.toISOString(), bucket },
      stats: [
        {
          key: 'revenue',
          label: 'Total Revenue',
          value: revenue.total,
          previousValue: prevRevenue,
          changePct: changePct(revenue.total, prevRevenue),
          series: revenue.series,
        },
        {
          key: 'orders',
          label: 'Total Orders',
          value: orders.total,
          previousValue: prevOrders,
          changePct: changePct(orders.total, prevOrders),
          series: orders.series,
        },
        {
          key: 'newUsers',
          label: 'New Users',
          value: newUsers.total,
          previousValue: prevNewUsers,
          changePct: changePct(newUsers.total, prevNewUsers),
          series: newUsers.series,
        },
        {
          key: 'newSubscriptions',
          label: 'New Subscriptions',
          value: newSubscriptions.total,
          previousValue: prevNewSubscriptions,
          changePct: changePct(newSubscriptions.total, prevNewSubscriptions),
          series: newSubscriptions.series,
        },
      ],
      orderStatusBreakdown,
      paidOrderRate,
      aiAnalytics: {
        totalCredits: aiSeries.reduce((sum, item) => sum + item.credits, 0),
        totalModelCalls: aiSeries.reduce(
          (sum, item) => sum + item.modelCalls,
          0,
        ),
        totalInputTokens: aiSeries.reduce(
          (sum, item) => sum + item.inputTokens,
          0,
        ),
        totalOutputTokens: aiSeries.reduce(
          (sum, item) => sum + item.outputTokens,
          0,
        ),
        totalTokens: aiSeries.reduce((sum, item) => sum + item.totalTokens, 0),
        series: aiSeries,
        models: modelSeries,
        dailyModels: dailyModelSeries,
      },
      dbEngineBreakdown: dbEngines,
      planDistribution,
      projectAnalytics: {
        totalProjects,
        totalExports,
      },
    };
  }

  async listUsers(page = 1, limit = 20, keyword?: string) {
    const where = keyword
      ? [{ email: ILike(`%${keyword}%`) }, { fullName: ILike(`%${keyword}%`) }]
      : undefined;
    const [items, total] = await this.usersRepo.findAndCount({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarKey: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((user) => ({
        ...user,
        avatar: resolveAvatarUrl(user, this.s3Service),
      })),
      pagination: { page, limit, total },
    };
  }

  async updateUserStatus(
    adminUserId: string,
    userId: string,
    dto: UpdateUserStatusDto,
  ) {
    if (adminUserId === userId && dto.status === UserStatus.Suspended) {
      throw new BadRequestException('Administrators cannot suspend themselves');
    }
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const before = {
      status: user.status,
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
    };
    user.status = dto.status;
    user.suspendedAt = dto.status === UserStatus.Suspended ? new Date() : null;
    user.suspendedReason =
      dto.status === UserStatus.Suspended ? (dto.reason ?? null) : null;
    await this.usersRepo.save(user);
    await this.auditRepo.save(
      this.auditRepo.create({
        adminUserId,
        action: 'user.status.update',
        targetType: 'user',
        targetId: userId,
        beforeData: before,
        afterData: {
          status: user.status,
          suspendedAt: user.suspendedAt,
          suspendedReason: user.suspendedReason,
        },
        reason: dto.reason ?? null,
      }),
    );
    return { id: user.id, status: user.status };
  }

  listWorkspaces() {
    return this.workspacesRepo.find({
      relations: ['owner'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  listProjects() {
    return this.projectsRepo.find({
      relations: ['owner', 'workspace'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async listOrders() {
    const orders = await this.ordersRepo.find({
      relations: ['workspace', 'plan', 'creator'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return orders.map((order) => ({
      ...order,
      buyer: order.creator
        ? {
            id: order.creator.id,
            fullName: order.creator.fullName,
            email: order.creator.email,
            avatar: resolveAvatarUrl(order.creator, this.s3Service),
          }
        : null,
    }));
  }

  async listSubscriptions() {
    const subscriptions = await this.subscriptionsRepo.find({
      relations: ['workspace', 'workspace.owner', 'plan'],
      order: { updatedAt: 'DESC' },
      take: 200,
    });
    return subscriptions.map((subscription) => ({
      ...subscription,
      owner: subscription.workspace?.owner
        ? {
            id: subscription.workspace.owner.id,
            fullName: subscription.workspace.owner.fullName,
            email: subscription.workspace.owner.email,
            avatar: resolveAvatarUrl(
              subscription.workspace.owner,
              this.s3Service,
            ),
          }
        : null,
    }));
  }

  async updateSubscription(
    adminUserId: string,
    subscriptionId: string,
    dto: UpdateSubscriptionDto,
  ) {
    const subscription = await this.subscriptionsRepo.findOne({
      where: { id: subscriptionId },
      relations: ['workspace', 'plan'],
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    if (dto.action === 'resume') {
      const fallbackSubscriptions = await this.subscriptionsRepo.find({
        where: {
          workspaceId: subscription.workspaceId,
          status: SubscriptionStatus.Active,
        },
      });
      for (const fallback of fallbackSubscriptions) {
        if (fallback.id !== subscription.id) {
          fallback.status = SubscriptionStatus.Expired;
          await this.subscriptionsRepo.save(fallback);
        }
      }
    }

    this.applySubscriptionAction(subscription, dto.action);
    if (dto.action === 'resume') {
      subscription.workspace.status = WorkspaceStatus.Active;
      await this.workspacesRepo.save(subscription.workspace);
    }
    subscription.metadata = {
      ...subscription.metadata,
      adminAction: dto.action,
      adminMessage: dto.reason.trim(),
      adminActionAt: new Date().toISOString(),
    };
    const saved = await this.subscriptionsRepo.save(subscription);
    void adminUserId;
    return saved;
  }

  private applySubscriptionAction(
    subscription: SubscriptionEntity,
    action: AdminSubscriptionAction,
  ) {
    if (action === 'pause') {
      subscription.status = SubscriptionStatus.Paused;
      return;
    }
    if (action === 'resume') {
      subscription.status = SubscriptionStatus.Active;
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = null;
      return;
    }
    if (action === 'cancel_at_period_end') {
      subscription.cancelAtPeriodEnd = true;
      return;
    }
    if (action === 'resume_renewal') {
      subscription.cancelAtPeriodEnd = false;
      return;
    }
    subscription.status = SubscriptionStatus.Canceled;
    subscription.cancelAtPeriodEnd = false;
    subscription.canceledAt = new Date();
  }

  async listPlans() {
    const plans = await this.plansRepo.find({
      order: { displayOrder: 'ASC' },
    });
    const needsDefault = plans.some((plan) => !plan.aiModel);
    const defaultModel = needsDefault
      ? this.aiIngestionService.getDefaultModel()
      : null;
    return plans.map((plan) => ({
      ...plan,
      effectiveAiModel: plan.aiModel || defaultModel,
    }));
  }

  private withEffectiveAiModel(plan: PlanEntity) {
    const defaultModel = plan.aiModel
      ? null
      : this.aiIngestionService.getDefaultModel();
    return {
      ...plan,
      effectiveAiModel: plan.aiModel || defaultModel,
    };
  }

  async createPlan(adminUserId: string, dto: CreatePlanDto) {
    const existing = await this.plansRepo.findOne({
      where: { code: dto.code, version: 1 },
    });
    if (existing) throw new ConflictException('Plan code already exists');
    const plan = this.plansRepo.create({
      code: dto.code,
      version: 1,
      name: dto.name,
      description: dto.description ?? null,
      workspaceType: dto.workspaceType,
      currency: dto.currency ?? 'USD',
      monthlyBasePrice: dto.monthlyBasePrice,
      yearlyBasePrice: dto.yearlyBasePrice,
      monthlySeatPrice: dto.monthlySeatPrice ?? null,
      yearlySeatPrice: dto.yearlySeatPrice ?? null,
      includedSeats: dto.includedSeats ?? 1,
      limits: dto.limits ?? {},
      features: dto.features ?? {},
      aiModel: dto.aiModel?.trim() || null,
      isActive: dto.isActive ?? true,
      displayOrder: dto.displayOrder ?? 0,
    });
    const saved = await this.plansRepo.save(plan);
    await this.auditRepo.save(
      this.auditRepo.create({
        adminUserId,
        action: 'plan.create',
        targetType: 'plan',
        targetId: saved.id,
        beforeData: null,
        afterData: dto as unknown as Record<string, unknown>,
      }),
    );
    return this.withEffectiveAiModel(saved);
  }

  async updatePlan(adminUserId: string, planId: string, dto: UpdatePlanDto) {
    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const before = {
      name: plan.name,
      description: plan.description,
      workspaceType: plan.workspaceType,
      currency: plan.currency,
      monthlyBasePrice: plan.monthlyBasePrice,
      yearlyBasePrice: plan.yearlyBasePrice,
      monthlySeatPrice: plan.monthlySeatPrice,
      yearlySeatPrice: plan.yearlySeatPrice,
      includedSeats: plan.includedSeats,
      isActive: plan.isActive,
      displayOrder: plan.displayOrder,
      limits: plan.limits,
      features: plan.features,
      aiModel: plan.aiModel,
    };
    if (dto.aiModel !== undefined) {
      dto.aiModel = dto.aiModel?.trim() || null;
    }
    Object.assign(plan, dto);
    const saved = await this.plansRepo.save(plan);
    await this.auditRepo.save(
      this.auditRepo.create({
        adminUserId,
        action: 'plan.update',
        targetType: 'plan',
        targetId: planId,
        beforeData: before,
        afterData: dto as Record<string, unknown>,
      }),
    );
    return this.withEffectiveAiModel(saved);
  }

  listAuditLogs() {
    return this.auditRepo.find({
      relations: ['admin'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
