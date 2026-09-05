import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DbConnectionEntity } from './entity/db-connection.entity';
import { ProjectDbConnectionEntity } from './entity/project-db-connection.entity';
import { DbConnectionsController } from './db-connections.controller';
import { DbConnectionsService } from './db-connections.service';
import { AiIngestionModule } from '../ai-ingestion/ai-ingestion.module';
import { WorkspacesModule } from '@/modules/workspaces/workspaces.module';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { UsageModule } from '@/modules/usage/usage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DbConnectionEntity,
      ProjectDbConnectionEntity,
      ProjectEntity,
    ]),
    AiIngestionModule,
    WorkspacesModule,
    ProjectsModule,
    SubscriptionsModule,
    UsageModule,
  ],
  controllers: [DbConnectionsController],
  providers: [DbConnectionsService],
  exports: [DbConnectionsService],
})
export class DbConnectionsModule {}
