import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DbConnectionEntity } from '@/modules/db-connections/entity/db-connection.entity';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { SchemaEntity } from '@/modules/projects/entity/schema.entity';
import { WorkspaceInvitationEntity } from '@/modules/workspaces/entity/workspace-invitation.entity';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import { PlanEntity } from './entity/plan.entity';
import { SubscriptionEntity } from './entity/subscription.entity';
import { SubscriptionStatus } from './subscription.enums';
import { SubscriptionsService } from './subscriptions.service';
import { UsageCounterEntity } from '@/modules/usage/entity/usage-counter.entity';
import { ProjectDocumentEntity } from '@/modules/project-documents/entity/project-document.entity';
import { ExportRecordEntity } from '@/modules/export-records/entity/export-record.entity';
import { SchemaVersionEntity } from '@/modules/projects/entity/schema-version.entity';

const repo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let subscriptionsRepo: ReturnType<typeof repo>;
  let projectsRepo: ReturnType<typeof repo>;

  beforeEach(async () => {
    subscriptionsRepo = repo();
    projectsRepo = repo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: getRepositoryToken(PlanEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(SubscriptionEntity),
          useValue: subscriptionsRepo,
        },
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(WorkspaceMemberEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(WorkspaceInvitationEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: projectsRepo,
        },
        {
          provide: getRepositoryToken(SchemaEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(DbConnectionEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(UsageCounterEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(ProjectDocumentEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(ExportRecordEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(SchemaVersionEntity),
          useValue: repo(),
        },
      ],
    }).compile();
    service = module.get(SubscriptionsService);
  });

  it('rejects project creation when the plan limit is reached', async () => {
    subscriptionsRepo.findOne.mockResolvedValue({
      status: SubscriptionStatus.Active,
      quantity: 1,
      plan: { limits: { projects: 3 } },
    });
    projectsRepo.count.mockResolvedValue(3);

    await expect(
      service.assertProjectQuota('workspace-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows project creation below the plan limit', async () => {
    subscriptionsRepo.findOne.mockResolvedValue({
      status: SubscriptionStatus.Active,
      quantity: 1,
      plan: { limits: { projects: 3 } },
    });
    projectsRepo.count.mockResolvedValue(2);

    await expect(
      service.assertProjectQuota('workspace-1'),
    ).resolves.toBeUndefined();
  });
});
