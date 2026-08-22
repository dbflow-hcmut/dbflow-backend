import { Repository } from 'typeorm';
import { WorkspaceAuditLogEntity } from '@/modules/workspaces/entity/workspace-audit-log.entity';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { WorkspaceRole } from '@/modules/workspaces/workspace.enums';
import { GroupEntity } from './entity/group.entity';
import { GroupMemberEntity } from './entity/group-member.entity';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const groupsRepo = { find: jest.fn() };
  const groupMembersRepo = {};
  const workspaceMembersRepo = { findOne: jest.fn() };
  const auditLogsRepo = {};
  const service = new GroupsService(
    groupsRepo as unknown as Repository<GroupEntity>,
    groupMembersRepo as Repository<GroupMemberEntity>,
    workspaceMembersRepo as unknown as Repository<WorkspaceMemberEntity>,
    auditLogsRepo as Repository<WorkspaceAuditLogEntity>,
  );

  beforeEach(() => jest.clearAllMocks());

  it('only lists Groups joined by a regular member', async () => {
    workspaceMembersRepo.findOne.mockResolvedValue({
      role: WorkspaceRole.Member,
    });
    groupsRepo.find.mockResolvedValue([]);

    await service.listGroups('member-a', 'workspace-1');

    expect(groupsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          members: { userId: 'member-a' },
        },
      }),
    );
  });

  it.each([WorkspaceRole.Owner, WorkspaceRole.Admin])(
    'lists every Group for workspace role %s',
    async (role) => {
      workspaceMembersRepo.findOne.mockResolvedValue({ role });
      groupsRepo.find.mockResolvedValue([]);

      await service.listGroups('manager-a', 'workspace-1');

      expect(groupsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'workspace-1' } }),
      );
    },
  );
});
