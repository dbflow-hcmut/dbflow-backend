import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { WorkspaceAuditLogEntity } from '@/modules/workspaces/entity/workspace-audit-log.entity';
import { GroupEntity } from './entity/group.entity';
import { GroupMemberEntity } from './entity/group-member.entity';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      WorkspaceMemberEntity,
      WorkspaceAuditLogEntity,
    ]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
