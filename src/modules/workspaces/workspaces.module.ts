import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMemberEntity } from './entity/workspace-member.entity';
import { WorkspaceEntity } from './entity/workspace.entity';
import { WorkspaceInvitationEntity } from './entity/workspace-invitation.entity';
import { WorkspaceAuditLogEntity } from './entity/workspace-audit-log.entity';
import { UserEntity } from '@/modules/users/user.entity';
import { MailModule } from '@/modules/mail/mail.module';
import { WorkspaceInvitationsController } from './workspace-invitations.controller';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { GroupsModule } from '@/modules/groups/groups.module';
import { S3Module } from '@/modules/s3/s3.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      WorkspaceMemberEntity,
      WorkspaceInvitationEntity,
      WorkspaceAuditLogEntity,
      UserEntity,
    ]),
    MailModule,
    SubscriptionsModule,
    GroupsModule,
    S3Module,
  ],
  controllers: [WorkspacesController, WorkspaceInvitationsController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
