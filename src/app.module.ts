import { Module } from '@nestjs/common';
import { UsersModule } from '@/modules/users/users.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { AdminModule } from '@/modules/admin/admin.module';
import { S3Module } from '@/modules/s3/s3.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import { ProjectCollaborationModule } from './modules/project-collaboration/project-collaboration.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ChatModule } from './modules/chat/chat.module';
import { CommentsModule } from './modules/comments/comments.module';
import { DbConnectionsModule } from './modules/db-connections/db-connections.module';
import { ProjectDocumentsModule } from './modules/project-documents/project-documents.module';
import { ExportRecordsModule } from './modules/export-records/export-records.module';
import { SandboxModule } from './modules/sandbox/sandbox.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { UsageModule } from './modules/usage/usage.module';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT || 5432),
        username: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        database: process.env.POSTGRES_DB || 'dbflow',
        entities: [UserEntity],
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    UsersModule,
    ProjectsModule,
    S3Module,
    ProjectCollaborationModule,
    AdminModule,
    ChatModule,
    CommentsModule,
    DbConnectionsModule,
    ProjectDocumentsModule,
    ExportRecordsModule,
    SandboxModule,
    WorkspacesModule,
    SubscriptionsModule,
    UsageModule,
    AiGatewayModule,
    BillingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
