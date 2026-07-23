import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, QueryFailedError, Repository } from 'typeorm';
import {
  WorkspaceInvitationEntity,
  WorkspaceInvitationStatus,
} from '@/modules/workspaces/entity/workspace-invitation.entity';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import {
  WorkspaceMemberStatus,
  WorkspaceType,
} from '@/modules/workspaces/workspace.enums';
import { PlanEntity } from './entity/plan.entity';
import { SubscriptionEntity } from './entity/subscription.entity';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { SchemaEntity } from '@/modules/projects/entity/schema.entity';
import { DbConnectionEntity } from '@/modules/db-connections/entity/db-connection.entity';
import { UsageCounterEntity } from '@/modules/usage/entity/usage-counter.entity';
import { ProjectDocumentEntity } from '@/modules/project-documents/entity/project-document.entity';
import { SchemaVersionEntity } from '@/modules/projects/entity/schema-version.entity';
import { BillingCycle, SubscriptionStatus } from './subscription.enums';

const CURRENT_STATUSES = [
  SubscriptionStatus.Trialing,
  SubscriptionStatus.Active,
  SubscriptionStatus.PastDue,
];

@Injectable()
export class SubscriptionsService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(PlanEntity)
    private readonly plansRepo: Repository<PlanEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionsRepo: Repository<SubscriptionEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspacesRepo: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly membersRepo: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceInvitationEntity)
    private readonly invitationsRepo: Repository<WorkspaceInvitationEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepo: Repository<ProjectEntity>,
    @InjectRepository(SchemaEntity)
    private readonly schemasRepo: Repository<SchemaEntity>,
    @InjectRepository(DbConnectionEntity)
    private readonly dbConnectionsRepo: Repository<DbConnectionEntity>,
    @InjectRepository(UsageCounterEntity)
    private readonly usageCountersRepo: Repository<UsageCounterEntity>,
    @InjectRepository(ProjectDocumentEntity)
    private readonly documentsRepo: Repository<ProjectDocumentEntity>,
    @InjectRepository(SchemaVersionEntity)
    private readonly schemaVersionsRepo: Repository<SchemaVersionEntity>,
  ) {}

  onModuleInit() {
    this.expiryTimer = setInterval(
      () => void this.expireEndedSubscriptions(),
      10 * 60 * 1000,
    );
    this.expiryTimer.unref();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  async expireEndedSubscriptions() {
    const result = await this.subscriptionsRepo.update(
      {
        status: SubscriptionStatus.Active,
        provider: 'payos',
        currentPeriodEnd: LessThan(new Date()),
      },
      { status: SubscriptionStatus.Expired },
    );
    return result.affected ?? 0;
  }

  async listPlans() {
    return this.plansRepo.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', version: 'DESC' },
    });
  }

  async ensureDefaultSubscription(workspace: WorkspaceEntity) {
    const existing = await this.findCurrent(workspace.id);
    if (existing) return existing;
    const planCode =
      workspace.type === WorkspaceType.Team ? 'team_free' : 'free';
    const plan = await this.plansRepo.findOne({
      where: { code: planCode, version: 1, isActive: true },
    });
    if (!plan) {
      throw new NotFoundException(`Default plan ${planCode} not found`);
    }
    const start = new Date();
    const end = new Date(start);
    end.setUTCFullYear(end.getUTCFullYear() + 100);
    try {
      await this.subscriptionsRepo.save(
        this.subscriptionsRepo.create({
          workspaceId: workspace.id,
          planId: plan.id,
          status: SubscriptionStatus.Active,
          billingCycle: BillingCycle.Custom,
          quantity: plan.includedSeats,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
          metadata: { source: 'default' },
        }),
      );
    } catch (error) {
      // Another request may have created the default subscription concurrently.
      if (!(error instanceof QueryFailedError)) throw error;
    }
    return this.requireCurrent(workspace.id);
  }

  async getWorkspaceSubscription(userId: string, workspaceId: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const subscription = await this.findCurrent(workspaceId);
    if (!subscription) {
      const workspace = await this.workspacesRepo.findOne({
        where: { id: workspaceId },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      return this.ensureDefaultSubscription(workspace);
    }
    return subscription;
  }

  async getEntitlements(userId: string, workspaceId: string) {
    await this.assertWorkspaceMember(userId, workspaceId);
    const latestSubscription = await this.subscriptionsRepo.findOne({
      where: { workspaceId },
      relations: ['plan', 'workspace'],
      order: { createdAt: 'DESC' },
    });
    if (!latestSubscription) throw new NotFoundException('Subscription not found');
    const subscription = await this.getWorkspaceSubscription(userId, workspaceId);
    const restrictedSubscription = await this.subscriptionsRepo.findOne({
      where: {
        workspaceId,
        status: In([SubscriptionStatus.Paused, SubscriptionStatus.Canceled]),
      },
      order: { updatedAt: 'DESC' },
    });
    const [
      activeMembers,
      pendingInvitations,
      projects,
      dbConnections,
      totalSchemas,
      aiCounter,
      documentStorage,
      exportsCounter,
    ] = await Promise.all([
      this.membersRepo.count({
        where: {
          workspaceId,
          status: WorkspaceMemberStatus.Active,
        },
      }),
      this.invitationsRepo.count({
        where: {
          workspaceId,
          status: WorkspaceInvitationStatus.Pending,
        },
      }),
      this.projectsRepo.count({ where: { workspaceId } }),
      this.dbConnectionsRepo.count({ where: { workspaceId } }),
      this.schemasRepo
        .createQueryBuilder('schema')
        .innerJoin(ProjectEntity, 'project', 'project.id = schema.projectId')
        .where('project.workspaceId = :workspaceId', { workspaceId })
        .getCount(),
      this.usageCountersRepo.findOne({
        where: {
          workspaceId,
          metric: 'ai_requests_monthly',
          periodKey: this.currentPeriodKey(),
        },
      }),
      this.documentsRepo
        .createQueryBuilder('document')
        .innerJoin(ProjectEntity, 'project', 'project.id = document.projectId')
        .select('COALESCE(SUM(document.size), 0)', 'total')
        .where('project.workspaceId = :workspaceId', { workspaceId })
        .getRawOne<{ total: string }>(),
      this.usageCountersRepo.findOne({
        where: {
          workspaceId,
          metric: 'exports_monthly',
          periodKey: this.currentPeriodKey(),
        },
      }),
    ]);
    const seatLimit = this.getLimit(
      subscription.plan,
      'workspace_seats',
      subscription.quantity,
    );
    return {
      subscription,
      plan: subscription.plan,
      access: {
        suspended: subscription.workspace.status === 'suspended',
        restricted: Boolean(restrictedSubscription),
        message:
          typeof restrictedSubscription?.metadata?.adminMessage === 'string'
            ? restrictedSubscription.metadata.adminMessage
            : null,
        action:
          typeof restrictedSubscription?.metadata?.adminAction === 'string'
            ? restrictedSubscription.metadata.adminAction
            : null,
      },
      usage: {
        workspaceSeats: {
          active: activeMembers,
          pending: pendingInvitations,
          used: activeMembers + pendingInvitations,
          limit: seatLimit,
        },
        projects: {
          used: projects,
          limit: subscription.plan.limits.projects ?? null,
        },
        dbConnections: {
          used: dbConnections,
          limit: subscription.plan.limits.db_connections ?? null,
        },
        schemas: {
          used: totalSchemas,
          limitPerProject: subscription.plan.limits.schemas_per_project ?? null,
        },
        aiRequests: {
          used: Number(aiCounter?.used ?? 0),
          reserved: Number(aiCounter?.reserved ?? 0),
          limit: subscription.plan.limits.ai_requests_monthly ?? null,
          periodKey: this.currentPeriodKey(),
        },
        documentStorage: {
          used: Number(documentStorage?.total ?? 0),
          limit: subscription.plan.limits.document_storage_bytes ?? null,
        },
        exports: {
          used: Number(exportsCounter?.used ?? 0),
          limit: subscription.plan.limits.exports_monthly ?? null,
          periodKey: this.currentPeriodKey(),
        },
      },
    };
  }

  async assertProjectQuota(workspaceId: string) {
    const subscription = await this.requireCurrent(workspaceId);
    const limit = subscription.plan.limits.projects;
    if (limit == null) return;
    const used = await this.projectsRepo.count({ where: { workspaceId } });
    this.assertWithinLimit('projects', used, Number(limit));
  }

  async assertSchemaQuota(workspaceId: string, projectId: string) {
    const subscription = await this.requireCurrent(workspaceId);
    const limit = subscription.plan.limits.schemas_per_project;
    if (limit == null) return;
    const used = await this.schemasRepo.count({ where: { projectId } });
    this.assertWithinLimit('schemas_per_project', used, Number(limit));
  }

  async assertDbConnectionQuota(workspaceId: string) {
    const subscription = await this.requireCurrent(workspaceId);
    const limit = subscription.plan.limits.db_connections;
    if (limit == null) return;
    const used = await this.dbConnectionsRepo.count({
      where: { workspaceId },
    });
    this.assertWithinLimit('db_connections', used, Number(limit));
  }

  async assertDocumentStorageQuota(projectId: string, additionalBytes: number) {
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    const subscription = await this.requireCurrent(project.workspaceId);
    const limit = subscription.plan.limits.document_storage_bytes;
    if (limit == null) return;
    const raw = await this.documentsRepo
      .createQueryBuilder('document')
      .innerJoin(ProjectEntity, 'project', 'project.id = document.projectId')
      .select('COALESCE(SUM(document.size), 0)', 'total')
      .where('project.workspaceId = :workspaceId', {
        workspaceId: project.workspaceId,
      })
      .getRawOne<{ total: string }>();
    const used = Number(raw?.total ?? 0);
    if (used + additionalBytes > Number(limit)) {
      throw new ForbiddenException({
        code: 'QUOTA_EXCEEDED',
        metric: 'document_storage_bytes',
        used,
        requested: additionalBytes,
        limit,
      });
    }
  }

  async assertExportQuota(projectId: string) {
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    const subscription = await this.requireCurrent(project.workspaceId);
    const limit = subscription.plan.limits.exports_monthly;
    if (limit == null) return;
    const counter = await this.usageCountersRepo.findOne({
      where: {
        workspaceId: project.workspaceId,
        metric: 'exports_monthly',
        periodKey: this.currentPeriodKey(),
      },
    });
    const used = Number(counter?.used ?? 0);
    this.assertWithinLimit('exports_monthly', used, Number(limit));
  }

  async assertFeatureForWorkspace(
    workspaceId: string,
    feature: string,
  ): Promise<void> {
    const subscription = await this.requireCurrent(workspaceId);
    if (subscription.plan.features?.[feature] !== true) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_INCLUDED',
        feature,
        message: `${feature} feature is not included in the current plan`,
      });
    }
  }

  async assertSchemaVersionQuota(projectId: string, schemaId: string) {
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    const subscription = await this.requireCurrent(project.workspaceId);
    const limit = subscription.plan.limits.schema_versions_per_schema;
    if (limit == null) return;
    const used = await this.schemaVersionsRepo.count({ where: { schemaId } });
    this.assertWithinLimit('schema_versions_per_schema', used, Number(limit));
  }

  async assertSeatAvailableForInvite(workspaceId: string) {
    const subscription = await this.requireCurrent(workspaceId);
    const [activeMembers, pendingInvitations] = await Promise.all([
      this.membersRepo.count({
        where: {
          workspaceId,
          status: WorkspaceMemberStatus.Active,
        },
      }),
      this.invitationsRepo.count({
        where: {
          workspaceId,
          status: WorkspaceInvitationStatus.Pending,
        },
      }),
    ]);
    const limit = this.getLimit(
      subscription.plan,
      'workspace_seats',
      subscription.quantity,
    );
    if (limit !== null && activeMembers + pendingInvitations >= Number(limit)) {
      throw new ForbiddenException({
        code: 'SEAT_LIMIT_REACHED',
        message: 'Workspace seat limit reached',
        used: activeMembers + pendingInvitations,
        limit,
      });
    }
  }

  async assertSeatAvailableForAccept(workspaceId: string) {
    const subscription = await this.requireCurrent(workspaceId);
    const activeMembers = await this.membersRepo.count({
      where: {
        workspaceId,
        status: WorkspaceMemberStatus.Active,
      },
    });
    const limit = this.getLimit(
      subscription.plan,
      'workspace_seats',
      subscription.quantity,
    );
    if (limit !== null && activeMembers >= Number(limit)) {
      throw new ForbiddenException({
        code: 'SEAT_LIMIT_REACHED',
        message: 'Workspace seat limit reached',
        used: activeMembers,
        limit,
      });
    }
  }

  private findCurrent(workspaceId: string) {
    return this.subscriptionsRepo.findOne({
      where: {
        workspaceId,
        status: In(CURRENT_STATUSES),
      },
      relations: ['plan', 'workspace'],
      order: { createdAt: 'DESC' },
    });
  }

  private async requireCurrent(workspaceId: string) {
    const subscription = await this.findCurrent(workspaceId);
    if (!subscription) {
      throw new ForbiddenException('Workspace has no active subscription');
    }
    return subscription;
  }

  private async assertWorkspaceMember(userId: string, workspaceId: string) {
    const member = await this.membersRepo.findOne({
      where: {
        userId,
        workspaceId,
        status: WorkspaceMemberStatus.Active,
      },
    });
    if (!member) throw new NotFoundException('Workspace not found');
  }

  private assertWithinLimit(metric: string, used: number, limit: number) {
    if (used >= limit) {
      throw new ForbiddenException({
        code: 'QUOTA_EXCEEDED',
        message: `${metric} quota exceeded`,
        metric,
        used,
        limit,
      });
    }
  }

  private getLimit(
    plan: PlanEntity,
    metric: string,
    fallback: number | null,
  ): number | null {
    return Object.prototype.hasOwnProperty.call(plan.limits, metric)
      ? plan.limits[metric]
      : fallback;
  }

  private currentPeriodKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
