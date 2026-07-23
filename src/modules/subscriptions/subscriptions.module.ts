import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceInvitationEntity } from '@/modules/workspaces/entity/workspace-invitation.entity';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import { PlanEntity } from './entity/plan.entity';
import { SubscriptionEntity } from './entity/subscription.entity';
import {
  PlansController,
  SubscriptionsController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { SchemaEntity } from '@/modules/projects/entity/schema.entity';
import { DbConnectionEntity } from '@/modules/db-connections/entity/db-connection.entity';
import { UsageCounterEntity } from '@/modules/usage/entity/usage-counter.entity';
import { ProjectDocumentEntity } from '@/modules/project-documents/entity/project-document.entity';
import { SchemaVersionEntity } from '@/modules/projects/entity/schema-version.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanEntity,
      SubscriptionEntity,
      WorkspaceEntity,
      WorkspaceMemberEntity,
      WorkspaceInvitationEntity,
      ProjectEntity,
      SchemaEntity,
      DbConnectionEntity,
      UsageCounterEntity,
      ProjectDocumentEntity,
      SchemaVersionEntity,
    ]),
  ],
  controllers: [PlansController, SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
