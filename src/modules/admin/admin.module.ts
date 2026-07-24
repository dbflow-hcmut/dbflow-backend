import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import { OrderEntity } from '@/modules/billing/entity/order.entity';
import { SubscriptionEntity } from '@/modules/subscriptions/entity/subscription.entity';
import { PlanEntity } from '@/modules/subscriptions/entity/plan.entity';
import { S3Module } from '@/modules/s3/s3.module';
import { AdminAuditLogEntity } from './entity/admin-audit-log.entity';
import { AdminManagementController } from './admin-management.controller';
import { AdminService } from './admin.service';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { DbConnectionEntity } from '@/modules/db-connections/entity/db-connection.entity';
import { ExportRecordEntity } from '@/modules/export-records/entity/export-record.entity';
import { UsageEventEntity } from '@/modules/usage/entity/usage-event.entity';
import { BillingModule } from '@/modules/billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      WorkspaceEntity,
      OrderEntity,
      SubscriptionEntity,
      PlanEntity,
      AdminAuditLogEntity,
      ProjectEntity,
      DbConnectionEntity,
      UsageEventEntity,
      ExportRecordEntity,
    ]),
    S3Module,
    BillingModule,
  ],
  controllers: [AdminManagementController],
  providers: [AdminService],
})
export class AdminModule {}
