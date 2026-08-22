import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { WorkspaceAuditLogEntity } from '@/modules/workspaces/entity/workspace-audit-log.entity';
import {
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '@/modules/workspaces/workspace.enums';
import { GroupEntity } from './entity/group.entity';
import { GroupMemberEntity } from './entity/group-member.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(GroupEntity)
    private readonly groupsRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly groupMembersRepo: Repository<GroupMemberEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly workspaceMembersRepo: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceAuditLogEntity)
    private readonly auditLogsRepo: Repository<WorkspaceAuditLogEntity>,
  ) {}

  /** Owner/Admin can list every Group; other active members only see Groups
   * they belong to. This keeps Group names and membership private while still
   * allowing members to select an eligible Group for a project.
   */
  async listGroups(userId: string, workspaceId: string) {
    const membership = await this.requireActiveMember(userId, workspaceId);
    const canSeeAll = [WorkspaceRole.Owner, WorkspaceRole.Admin].includes(
      membership.role,
    );
    const groups = await this.groupsRepo.find({
      where: canSeeAll ? { workspaceId } : { workspaceId, members: { userId } },
      relations: ['members', 'members.user'],
      order: { createdAt: 'ASC' },
    });
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      members: group.members.map((member) => ({
        userId: member.userId,
        fullName: member.user.fullName,
        email: member.user.email,
      })),
    }));
  }

  async createGroup(userId: string, workspaceId: string, name: string) {
    await this.assertOwnerOrAdmin(userId, workspaceId);
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Group name is required');
    const group = await this.groupsRepo.save(
      this.groupsRepo.create({ workspaceId, name: trimmed }),
    );
    await this.logActivity(
      workspaceId,
      userId,
      'group.create',
      'group',
      group.id,
      null,
      { name: trimmed },
    );
    return group;
  }

  async deleteGroup(userId: string, workspaceId: string, groupId: string) {
    const group = await this.requireGroup(workspaceId, groupId);
    await this.assertOwnerOrAdmin(userId, workspaceId);
    await this.groupsRepo.remove(group);
    await this.logActivity(
      workspaceId,
      userId,
      'group.delete',
      'group',
      groupId,
      { name: group.name },
      null,
    );
    return { message: 'Group deleted successfully' };
  }

  async addMember(
    userId: string,
    workspaceId: string,
    groupId: string,
    targetUserId: string,
  ) {
    const group = await this.requireGroup(workspaceId, groupId);
    await this.assertOwnerOrAdmin(userId, workspaceId);
    const targetMembership = await this.workspaceMembersRepo.findOne({
      where: {
        workspaceId,
        userId: targetUserId,
        status: WorkspaceMemberStatus.Active,
      },
      relations: ['user'],
    });
    if (!targetMembership) {
      throw new BadRequestException(
        'User must be an active workspace member to join a group',
      );
    }
    const existing = await this.groupMembersRepo.findOne({
      where: { groupId, userId: targetUserId },
    });
    if (existing) return existing;
    const saved = await this.groupMembersRepo.save(
      this.groupMembersRepo.create({ groupId, userId: targetUserId }),
    );
    await this.logActivity(
      workspaceId,
      userId,
      'group.member.add',
      'group_member',
      `${groupId}:${targetUserId}`,
      null,
      {
        groupId,
        groupName: group.name,
        userId: targetUserId,
        userName: targetMembership.user.fullName,
        userEmail: targetMembership.user.email,
      },
    );
    return saved;
  }

  async removeMember(
    userId: string,
    workspaceId: string,
    groupId: string,
    targetUserId: string,
  ) {
    const group = await this.requireGroup(workspaceId, groupId);
    await this.assertOwnerOrAdmin(userId, workspaceId);
    const targetMembership = await this.workspaceMembersRepo.findOne({
      where: { workspaceId, userId: targetUserId },
      relations: ['user'],
    });
    await this.groupMembersRepo.delete({ groupId, userId: targetUserId });
    await this.logActivity(
      workspaceId,
      userId,
      'group.member.remove',
      'group_member',
      `${groupId}:${targetUserId}`,
      {
        groupId,
        groupName: group.name,
        userId: targetUserId,
        userName: targetMembership?.user.fullName ?? null,
        userEmail: targetMembership?.user.email ?? null,
      },
      null,
    );
    return { message: 'Member removed from group successfully' };
  }

  async isUserInGroup(userId: string, groupId: string): Promise<boolean> {
    return this.groupMembersRepo.exists({ where: { groupId, userId } });
  }

  async belongsToWorkspace(
    groupId: string,
    workspaceId: string,
  ): Promise<boolean> {
    return this.groupsRepo.exists({ where: { id: groupId, workspaceId } });
  }

  /** Called by WorkspacesService when a user leaves/is removed from a workspace. */
  async removeUserFromWorkspaceGroups(workspaceId: string, userId: string) {
    const groups = await this.groupsRepo.find({
      where: { workspaceId },
      select: ['id'],
    });
    if (!groups.length) return;
    await this.groupMembersRepo.delete({
      userId,
      groupId: In(groups.map((group) => group.id)),
    });
  }

  private async requireGroup(
    workspaceId: string,
    groupId: string,
  ): Promise<GroupEntity> {
    const group = await this.groupsRepo.findOne({
      where: { id: groupId, workspaceId },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  private async assertOwnerOrAdmin(userId: string, workspaceId: string) {
    const membership = await this.workspaceMembersRepo.findOne({
      where: {
        userId,
        workspaceId,
        status: WorkspaceMemberStatus.Active,
      },
    });
    if (
      !membership ||
      ![WorkspaceRole.Owner, WorkspaceRole.Admin].includes(membership.role)
    ) {
      throw new ForbiddenException('Workspace admin permission required');
    }
  }

  private async requireActiveMember(userId: string, workspaceId: string) {
    const membership = await this.workspaceMembersRepo.findOne({
      where: {
        userId,
        workspaceId,
        status: WorkspaceMemberStatus.Active,
      },
    });
    if (!membership)
      throw new ForbiddenException('Workspace membership required');
    return membership;
  }

  private async logActivity(
    workspaceId: string,
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    beforeData: Record<string, unknown> | null,
    afterData: Record<string, unknown> | null,
  ) {
    await this.auditLogsRepo.save(
      this.auditLogsRepo.create({
        workspaceId,
        actorUserId,
        action,
        targetType,
        targetId,
        beforeData,
        afterData,
      }),
    );
  }
}
