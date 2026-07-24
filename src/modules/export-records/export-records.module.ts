import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportRecordEntity } from './entity/export-record.entity';
import { ExportRecordsController } from './export-records.controller';
import { ExportRecordsService } from './export-records.service';
import { DbConnectionsModule } from '@/modules/db-connections/db-connections.module';
import { UsageModule } from '@/modules/usage/usage.module';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportRecordEntity, ProjectEntity]),
    DbConnectionsModule,
    UsageModule,
    SubscriptionsModule,
  ],
  controllers: [ExportRecordsController],
  providers: [ExportRecordsService],
  exports: [ExportRecordsService],
})
export class ExportRecordsModule {}
