import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import {
  UsageEventEntity,
  UsageEventStatus,
} from './entity/usage-event.entity';
import { UsageCounterEntity } from './entity/usage-counter.entity';

@Injectable()
export class UsageService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(UsageEventEntity)
    private readonly eventsRepo: Repository<UsageEventEntity>,
    @InjectRepository(UsageCounterEntity)
    private readonly countersRepo: Repository<UsageCounterEntity>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(
      () => void this.releaseStaleReservations(),
      5 * 60 * 1000,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async releaseStaleReservations() {
    const stale = await this.eventsRepo.find({
      where: {
        status: UsageEventStatus.Reserved,
        updatedAt: LessThan(new Date(Date.now() - 30 * 60 * 1000)),
      },
      take: 500,
    });
    for (const event of stale) {
      await this.release(event.operationId).catch(() => undefined);
    }
    return stale.length;
  }

  async reserve(
    userId: string,
    workspaceId: string,
    metric: string,
    operationId: string,
    quantity = 1,
    metadata: Record<string, unknown> = {},
  ) {
    const subscription =
      await this.subscriptionsService.getWorkspaceSubscription(
        userId,
        workspaceId,
      );
    const limit = subscription.plan.limits[metric];
    const modelName =
      subscription.plan.aiModel?.trim() || process.env.API_MODEL?.trim();
    if (metric === 'ai_requests_monthly' && !modelName) {
      throw new Error('API_MODEL is required');
    }
    const periodKey = this.currentPeriodKey();

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "usage_counters"
          ("workspace_id", "user_id", "metric", "period_key", "used", "reserved")
         VALUES ($1, $2, $3, $4, 0, 0)
         ON CONFLICT ("workspace_id", "user_id", "metric", "period_key") DO NOTHING`,
        [workspaceId, userId, metric, periodKey],
      );
      const counter = await manager.getRepository(UsageCounterEntity).findOne({
        where: { workspaceId, userId, metric, periodKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!counter) throw new Error('Usage counter could not be created');
      const used = Number(counter.used);
      const reserved = Number(counter.reserved);
      if (
        limit !== null &&
        limit !== undefined &&
        used + reserved + quantity > limit
      ) {
        throw new ForbiddenException({
          code: 'QUOTA_EXCEEDED',
          message: `${metric} quota exceeded`,
          metric,
          used,
          reserved,
          limit,
        });
      }
      counter.reserved = String(reserved + quantity);
      await manager.getRepository(UsageCounterEntity).save(counter);
      const event = manager.getRepository(UsageEventEntity).create({
        workspaceId,
        userId,
        metric,
        quantity: String(quantity),
        operationId,
        periodKey,
        status: UsageEventStatus.Reserved,
        metadata: { ...metadata, modelName: modelName || null },
      });
      return manager.getRepository(UsageEventEntity).save(event);
    });
  }

  async commit(operationId: string) {
    return this.transition(operationId, UsageEventStatus.Committed);
  }

  async release(operationId: string) {
    return this.transition(operationId, UsageEventStatus.Released);
  }

  async recordTokenUsage(
    operationId: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      modelCalls: number;
      modelName?: string | null;
    },
  ) {
    await this.eventsRepo.update(
      { operationId },
      {
        inputTokens: String(Math.max(0, Math.round(usage.inputTokens))),
        outputTokens: String(Math.max(0, Math.round(usage.outputTokens))),
        modelCalls: Math.max(0, Math.round(usage.modelCalls)),
        modelName: usage.modelName?.trim() || null,
      },
    );
  }

  async getMetric(workspaceId: string, userId: string, metric: string) {
    const periodKey = this.currentPeriodKey();
    const counter = await this.countersRepo.findOne({
      where: { workspaceId, userId, metric, periodKey },
    });
    return {
      metric,
      periodKey,
      used: Number(counter?.used ?? 0),
      reserved: Number(counter?.reserved ?? 0),
    };
  }

  /**
   * Per-member breakdown of a metric for the current period, one row per
   * active workspace member (seats with no usage yet still show up at 0).
   */
  async getWorkspaceMemberBreakdown(workspaceId: string, metric: string) {
    const periodKey = this.currentPeriodKey();
    return this.countersRepo.find({
      where: { workspaceId, metric, periodKey },
    });
  }

  private async transition(
    operationId: string,
    target: UsageEventStatus.Committed | UsageEventStatus.Released,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.getRepository(UsageEventEntity).findOne({
        where: { operationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) throw new NotFoundException('Usage operation not found');
      if (event.status !== UsageEventStatus.Reserved) return event;
      const counter = await manager.getRepository(UsageCounterEntity).findOne({
        where: {
          workspaceId: event.workspaceId,
          userId: event.userId,
          metric: event.metric,
          periodKey: event.periodKey,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!counter) throw new NotFoundException('Usage counter not found');
      const quantity = Number(event.quantity);
      counter.reserved = String(
        Math.max(0, Number(counter.reserved) - quantity),
      );
      if (target === UsageEventStatus.Committed) {
        counter.used = String(Number(counter.used) + quantity);
      }
      event.status = target;
      await manager.getRepository(UsageCounterEntity).save(counter);
      return manager.getRepository(UsageEventEntity).save(event);
    });
  }

  private currentPeriodKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
