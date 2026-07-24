import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MailService } from '@/modules/mail/mail.service';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { UserEntity } from '@/modules/users/user.entity';
import { InviteWorkspaceMemberDto } from './dto/invite-workspace-member.dto';
import { TransferWorkspaceOwnershipDto } from './dto/transfer-workspace-ownership.dto';
import { UpdateWorkspaceMemberRoleDto } from './dto/update-workspace-member-role.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import {
  WorkspaceInvitationEntity,
  WorkspaceInvitationStatus,
} from './entity/workspace-invitation.entity';
import { WorkspaceMemberEntity } from './entity/workspace-member.entity';
import { WorkspaceEntity } from './entity/workspace.entity';
import {
  WorkspaceMemberStatus,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from './workspace.enums';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspacesRepo: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly membersRepo: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceInvitationEntity)
    private readonly invitationsRepo: Repository<WorkspaceInvitationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async ensurePersonalWorkspace(user: Pick<UserEntity, 'id' | 'fullName'>) {
    const existing = await this.workspacesRepo.findOne({
      where: {
        ownerUserId: user.id,
        type: WorkspaceType.Personal,
      },
    });
    if (existing) {
      await this.subscriptionsService.ensureDefaultSubscription(existing);
      return existing;
    }

    const workspace = await this.dataSource.transaction(async (manager) => {
      const workspaceRepo = manager.getRepository(WorkspaceEntity);
      const memberRepo = manager.getRepository(WorkspaceMemberEntity);
      const concurrentlyCreated = await workspaceRepo.findOne({
        where: {
          ownerUserId: user.id,
          type: WorkspaceType.Personal,
        },
      });
      if (concurrentlyCreated) return concurrentlyCreated;

      const workspace = await workspaceRepo.save(
        workspaceRepo.create({
          type: WorkspaceType.Personal,
          name: `${user.fullName || 'My'} Workspace`,
          slug: await this.createUniqueSlug(
            user.fullName || 'personal',
            workspaceRepo,
          ),
          ownerUserId: user.id,
          status: WorkspaceStatus.Active,
        }),
      );
      await memberRepo.save(
        memberRepo.create({
          workspaceId: workspace.id,
          userId: user.id,
          role: WorkspaceRole.Owner,
          status: WorkspaceMemberStatus.Active,
        }),
      );
      return workspace;
    });
    await this.subscriptionsService.ensureDefaultSubscription(workspace);
    return workspace;
  }

  async createTeam(userId: string, dto: CreateWorkspaceDto) {
    const workspace = await this.dataSource.transaction(async (manager) => {
      const workspaceRepo = manager.getRepository(WorkspaceEntity);
      const memberRepo = manager.getRepository(WorkspaceMemberEntity);
      const workspace = await workspaceRepo.save(
        workspaceRepo.create({
          type: WorkspaceType.Team,
          name: dto.name.trim(),
          slug: await this.createUniqueSlug(dto.name, workspaceRepo),
          ownerUserId: userId,
          status: WorkspaceStatus.Active,
        }),
      );
      await memberRepo.save(
        memberRepo.create({
          workspaceId: workspace.id,
          userId,
          role: WorkspaceRole.Owner,
          status: WorkspaceMemberStatus.Active,
        }),
      );
      return workspace;
    });
    await this.subscriptionsService.ensureDefaultSubscription(workspace);
    return workspace;
  }

  async findAllForUser(userId: string) {
    const memberships = await this.membersRepo.find({
      where: { userId, status: WorkspaceMemberStatus.Active },
      relations: ['workspace'],
      order: { joinedAt: 'ASC' },
    });
    return memberships
      .filter(
        (membership) =>
          membership.workspace.status !== WorkspaceStatus.Archived,
      )
      .map((membership) => ({
        ...membership.workspace,
        currentUserRole: membership.role,
      }));
  }

  async findOneForUser(userId: string, workspaceId: string) {
    const membership = await this.membersRepo.findOne({
      where: { userId, workspaceId, status: WorkspaceMemberStatus.Active },
      relations: ['workspace'],
    });
    if (
      !membership ||
      membership.workspace.status === WorkspaceStatus.Archived
    ) {
      throw new NotFoundException('Workspace not found');
    }
    return { ...membership.workspace, currentUserRole: membership.role };
  }

  async getPersonalWorkspace(userId: string) {
    const workspace = await this.workspacesRepo.findOne({
      where: {
        ownerUserId: userId,
        type: WorkspaceType.Personal,
        status: WorkspaceStatus.Active,
      },
    });
    if (!workspace) throw new NotFoundException('Personal workspace not found');
    return workspace;
  }

  async assertCanCreateResources(userId: string, workspaceId: string) {
    const membership = await this.getActiveMembership(userId, workspaceId);
    if (
      ![
        WorkspaceRole.Owner,
        WorkspaceRole.Admin,
        WorkspaceRole.Member,
      ].includes(membership.role)
    ) {
      throw new ForbiddenException('Workspace role cannot create resources');
    }
    return membership.workspace;
  }

  async assertActiveMember(userId: string, workspaceId: string) {
    return (await this.getActiveMembership(userId, workspaceId)).workspace;
  }

  async assertBillingPermission(userId: string, workspaceId: string) {
    const membership = await this.getActiveMembership(userId, workspaceId);
    if (
      ![WorkspaceRole.Owner, WorkspaceRole.Billing].includes(membership.role)
    ) {
      throw new ForbiddenException('Workspace billing permission required');
    }
    return membership.workspace;
  }

  async assertResourceWorkspaceAccess(userId: string, workspaceId: string) {
    const workspace = await this.workspacesRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace || workspace.status === WorkspaceStatus.Archived) {
      throw new NotFoundException('Workspace not found');
    }
    if (workspace.status === WorkspaceStatus.Suspended) {
      throw new ForbiddenException('Workspace is suspended');
    }
    if (workspace.type === WorkspaceType.Team) {
      await this.getActiveMembership(userId, workspaceId);
    }
    return workspace;
  }

  async canReceiveProjectAccess(workspaceId: string, email: string) {
    const workspace = await this.workspacesRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.type === WorkspaceType.Personal) return true;
    const user = await this.usersRepo.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) return false;
    return this.membersRepo.exists({
      where: {
        workspaceId,
        userId: user.id,
        status: WorkspaceMemberStatus.Active,
      },
    });
  }

  async update(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    const membership = await this.getActiveMembership(userId, workspaceId);
    if (![WorkspaceRole.Owner, WorkspaceRole.Admin].includes(membership.role)) {
      throw new ForbiddenException('Workspace admin permission required');
    }
    if (dto.name !== undefined) membership.workspace.name = dto.name.trim();
    if (dto.avatarKey !== undefined)
      membership.workspace.avatarKey = dto.avatarKey;
    return this.workspacesRepo.save(membership.workspace);
  }

  async listMembers(userId: string, workspaceId: string) {
    await this.getActiveMembership(userId, workspaceId);
    const members = await this.membersRepo.find({
      where: { workspaceId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
    return members.map((member) => ({
      userId: member.userId,
      email: member.user.email,
      fullName: member.user.fullName,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
    }));
  }

  async inviteMember(
    userId: string,
    workspaceId: string,
    dto: InviteWorkspaceMemberDto,
  ) {
    const membership = await this.requireManagementPermission(
      userId,
      workspaceId,
    );
    if (membership.workspace.type !== WorkspaceType.Team) {
      throw new BadRequestException(
        'Members cannot be invited to a personal workspace',
      );
    }
    if (dto.role === WorkspaceRole.Owner) {
      throw new BadRequestException(
        'Use ownership transfer to assign the owner role',
      );
    }

    const email = dto.email.trim().toLowerCase();
    const invitedUser = await this.usersRepo.findOne({ where: { email } });
    if (invitedUser) {
      const existingMember = await this.membersRepo.findOne({
        where: { workspaceId, userId: invitedUser.id },
      });
      if (existingMember) {
        throw new ConflictException('User is already a workspace member');
      }
    }

    const pending = await this.invitationsRepo.findOne({
      where: {
        workspaceId,
        email,
        status: WorkspaceInvitationStatus.Pending,
      },
    });
    if (pending && pending.expiresAt > new Date()) {
      throw new ConflictException('A pending invitation already exists');
    }
    if (pending) {
      pending.status = WorkspaceInvitationStatus.Expired;
      await this.invitationsRepo.save(pending);
    }
    await this.subscriptionsService.assertSeatAvailableForInvite(workspaceId);

    const token = crypto.randomBytes(32).toString('hex');
    const invitation = await this.invitationsRepo.save(
      this.invitationsRepo.create({
        workspaceId,
        email,
        role: dto.role,
        tokenHash: this.hashInvitationToken(token),
        invitedBy: userId,
        status: WorkspaceInvitationStatus.Pending,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    void this.mailService.sendWorkspaceInvitationEmail(
      email,
      membership.workspace.name,
      token,
    );
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  }

  async listInvitations(userId: string, workspaceId: string) {
    await this.getActiveMembership(userId, workspaceId);
    return this.invitationsRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInvitation(
    userId: string,
    workspaceId: string,
    invitationId: string,
  ) {
    await this.requireManagementPermission(userId, workspaceId);
    const invitation = await this.invitationsRepo.findOne({
      where: { id: invitationId, workspaceId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== WorkspaceInvitationStatus.Pending) {
      throw new BadRequestException('Only pending invitations can be revoked');
    }
    invitation.status = WorkspaceInvitationStatus.Revoked;
    await this.invitationsRepo.save(invitation);
    return { message: 'Invitation revoked successfully' };
  }

  async acceptInvitation(userId: string, rawToken: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const tokenHash = this.hashInvitationToken(rawToken);

    return this.dataSource.transaction(async (manager) => {
      const invitationRepo = manager.getRepository(WorkspaceInvitationEntity);
      const memberRepo = manager.getRepository(WorkspaceMemberEntity);
      const workspaceRepo = manager.getRepository(WorkspaceEntity);
      const invitation = await invitationRepo.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.status !== WorkspaceInvitationStatus.Pending) {
        throw new BadRequestException('Invitation is no longer pending');
      }
      if (invitation.expiresAt <= new Date()) {
        throw new BadRequestException('Invitation has expired');
      }
      if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new ForbiddenException(
          'Invitation belongs to a different email address',
        );
      }
      const workspace = await workspaceRepo.findOne({
        where: { id: invitation.workspaceId },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      if (workspace.status !== WorkspaceStatus.Active) {
        throw new ForbiddenException('Workspace is not active');
      }
      await this.subscriptionsService.assertSeatAvailableForAccept(
        invitation.workspaceId,
      );

      const existing = await memberRepo.findOne({
        where: { workspaceId: invitation.workspaceId, userId },
      });
      if (existing) {
        throw new ConflictException('User is already a workspace member');
      }
      await memberRepo.save(
        memberRepo.create({
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
          status: WorkspaceMemberStatus.Active,
        }),
      );
      invitation.status = WorkspaceInvitationStatus.Accepted;
      invitation.acceptedAt = new Date();
      await invitationRepo.save(invitation);
      return workspace;
    });
  }

  async updateMemberRole(
    actorUserId: string,
    workspaceId: string,
    targetUserId: string,
    dto: UpdateWorkspaceMemberRoleDto,
  ) {
    const actor = await this.requireManagementPermission(
      actorUserId,
      workspaceId,
    );
    if (dto.role === WorkspaceRole.Owner) {
      throw new BadRequestException(
        'Use ownership transfer to assign the owner role',
      );
    }
    const target = await this.membersRepo.findOne({
      where: { workspaceId, userId: targetUserId },
    });
    if (!target) throw new NotFoundException('Workspace member not found');
    if (target.role === WorkspaceRole.Owner) {
      throw new BadRequestException(
        'The owner role cannot be changed directly',
      );
    }
    if (
      actor.role === WorkspaceRole.Admin &&
      target.role === WorkspaceRole.Admin
    ) {
      throw new ForbiddenException('Admins cannot change another admin role');
    }
    target.role = dto.role;
    return this.membersRepo.save(target);
  }

  async removeMember(
    actorUserId: string,
    workspaceId: string,
    targetUserId: string,
  ) {
    const actor = await this.requireManagementPermission(
      actorUserId,
      workspaceId,
    );
    if (actorUserId === targetUserId) {
      throw new BadRequestException('Use the leave workspace endpoint');
    }
    const target = await this.membersRepo.findOne({
      where: { workspaceId, userId: targetUserId },
    });
    if (!target) throw new NotFoundException('Workspace member not found');
    if (target.role === WorkspaceRole.Owner) {
      throw new BadRequestException('Workspace owner cannot be removed');
    }
    if (
      actor.role === WorkspaceRole.Admin &&
      target.role === WorkspaceRole.Admin
    ) {
      throw new ForbiddenException('Admins cannot remove another admin');
    }
    await this.membersRepo.remove(target);
    return { message: 'Workspace member removed successfully' };
  }

  async leaveWorkspace(userId: string, workspaceId: string) {
    const membership = await this.getActiveMembership(userId, workspaceId);
    if (membership.workspace.type === WorkspaceType.Personal) {
      throw new BadRequestException('A personal workspace cannot be left');
    }
    if (membership.role === WorkspaceRole.Owner) {
      throw new BadRequestException(
        'Transfer ownership before leaving the workspace',
      );
    }
    await this.membersRepo.remove(membership);
    return { message: 'Workspace left successfully' };
  }

  async transferOwnership(
    userId: string,
    workspaceId: string,
    dto: TransferWorkspaceOwnershipDto,
  ) {
    const current = await this.getActiveMembership(userId, workspaceId);
    if (current.role !== WorkspaceRole.Owner) {
      throw new ForbiddenException(
        'Only the workspace owner can transfer ownership',
      );
    }
    if (current.workspace.type === WorkspaceType.Personal) {
      throw new BadRequestException(
        'Personal workspace ownership cannot be transferred',
      );
    }
    if (dto.targetUserId === userId) {
      throw new BadRequestException('Target user is already the owner');
    }

    return this.dataSource.transaction(async (manager) => {
      const workspaceRepo = manager.getRepository(WorkspaceEntity);
      const memberRepo = manager.getRepository(WorkspaceMemberEntity);
      const target = await memberRepo.findOne({
        where: {
          workspaceId,
          userId: dto.targetUserId,
          status: WorkspaceMemberStatus.Active,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('Target member not found');
      const owner = await memberRepo.findOneOrFail({
        where: { workspaceId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      const workspace = await workspaceRepo.findOneOrFail({
        where: { id: workspaceId },
        lock: { mode: 'pessimistic_write' },
      });

      owner.role = WorkspaceRole.Admin;
      target.role = WorkspaceRole.Owner;
      workspace.ownerUserId = target.userId;
      await memberRepo.save([owner, target]);
      await workspaceRepo.save(workspace);
      return workspace;
    });
  }

  private async requireManagementPermission(
    userId: string,
    workspaceId: string,
  ) {
    const membership = await this.getActiveMembership(userId, workspaceId);
    if (![WorkspaceRole.Owner, WorkspaceRole.Admin].includes(membership.role)) {
      throw new ForbiddenException('Workspace admin permission required');
    }
    await this.subscriptionsService.assertFeatureForWorkspace(
      workspaceId,
      'team_roles',
    );
    return membership;
  }

  private async getActiveMembership(userId: string, workspaceId: string) {
    const membership = await this.membersRepo.findOne({
      where: {
        userId,
        workspaceId,
        status: WorkspaceMemberStatus.Active,
      },
      relations: ['workspace'],
    });
    if (
      !membership ||
      membership.workspace.status === WorkspaceStatus.Archived
    ) {
      throw new NotFoundException('Workspace not found');
    }
    return membership;
  }

  private async createUniqueSlug(
    name: string,
    repository: Repository<WorkspaceEntity> = this.workspacesRepo,
  ): Promise<string> {
    const base =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 72) || 'workspace';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 8);
      const slug = `${base}-${suffix}`;
      if (!(await repository.exists({ where: { slug } }))) return slug;
    }
    throw new Error('Unable to generate a unique workspace slug');
  }

  private hashInvitationToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
