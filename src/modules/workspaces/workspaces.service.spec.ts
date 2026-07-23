import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { WorkspaceMemberEntity } from './entity/workspace-member.entity';
import { WorkspaceEntity } from './entity/workspace.entity';
import { WorkspaceInvitationEntity } from './entity/workspace-invitation.entity';
import { WorkspaceRole, WorkspaceType } from './workspace.enums';
import { WorkspacesService } from './workspaces.service';
import { UserEntity } from '@/modules/users/user.entity';
import { MailService } from '@/modules/mail/mail.service';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';

type WorkspaceRepoMock = {
  findOne: jest.Mock;
  exists: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

const createWorkspaceRepoMock = (): WorkspaceRepoMock => ({
  findOne: jest.fn(),
  exists: jest.fn(),
  create: jest.fn((value: Partial<WorkspaceEntity>) => value),
  save: jest.fn(),
});

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let workspaceRepo: WorkspaceRepoMock;
  let memberRepo: { findOne: jest.Mock; find: jest.Mock };
  let invitationRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let userRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    workspaceRepo = createWorkspaceRepoMock();
    memberRepo = { findOne: jest.fn(), find: jest.fn() };
    invitationRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    userRepo = { findOne: jest.fn() };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: workspaceRepo,
        },
        {
          provide: getRepositoryToken(WorkspaceMemberEntity),
          useValue: memberRepo,
        },
        {
          provide: getRepositoryToken(WorkspaceInvitationEntity),
          useValue: invitationRepo,
        },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: DataSource, useValue: dataSource },
        {
          provide: MailService,
          useValue: { sendWorkspaceInvitationEmail: jest.fn() },
        },
        {
          provide: SubscriptionsService,
          useValue: {
            ensureDefaultSubscription: jest.fn(),
            assertSeatAvailableForInvite: jest.fn(),
            assertSeatAvailableForAccept: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WorkspacesService);
  });

  it('reuses an existing personal workspace', async () => {
    const existing = { id: 'workspace-1', type: WorkspaceType.Personal };
    workspaceRepo.findOne.mockResolvedValue(existing);

    await expect(
      service.ensurePersonalWorkspace({ id: 'user-1', fullName: 'Alice' }),
    ).resolves.toBe(existing);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('creates a team and owner membership in one transaction', async () => {
    const transactionalWorkspaceRepo = createWorkspaceRepoMock();
    transactionalWorkspaceRepo.exists.mockResolvedValue(false);
    transactionalWorkspaceRepo.save.mockImplementation(
      (value: Partial<WorkspaceEntity>) =>
        Promise.resolve({ ...value, id: 'workspace-1' }),
    );
    const transactionalMemberRepo = {
      create: jest.fn((value: Partial<WorkspaceMemberEntity>) => value),
      save: jest.fn((value: Partial<WorkspaceMemberEntity>) =>
        Promise.resolve(value),
      ),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof WorkspaceEntity) =>
        entity === WorkspaceEntity
          ? transactionalWorkspaceRepo
          : transactionalMemberRepo,
      ),
    } as unknown as EntityManager;
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: EntityManager) => Promise<WorkspaceEntity>) =>
        callback(manager),
    );

    const result = await service.createTeam('user-1', { name: 'Core Team' });

    expect(result).toMatchObject({
      id: 'workspace-1',
      type: WorkspaceType.Team,
      name: 'Core Team',
      ownerUserId: 'user-1',
    });
    expect(transactionalMemberRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        role: WorkspaceRole.Owner,
      }),
    );
    expect(transactionalMemberRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does not allow a team owner to leave', async () => {
    memberRepo.findOne.mockResolvedValue({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      role: WorkspaceRole.Owner,
      status: 'active',
      workspace: {
        id: 'workspace-1',
        type: WorkspaceType.Team,
        status: 'active',
      },
    });

    await expect(
      service.leaveWorkspace('user-1', 'workspace-1'),
    ).rejects.toThrow('Transfer ownership before leaving the workspace');
  });
});
