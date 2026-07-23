import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './entity/project.entity';
import { SchemaEntity } from './entity/schema.entity';
import { SchemaVersionEntity } from './entity/schema-version.entity';
import { UserProjectEntity } from './entity/user-project.entity';
import { ProjectInvitationEntity } from './entity/project-invitation.entity';
import { S3Module } from '../s3/s3.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '@/redis/redis.module';
import { WorkspacesModule } from '@/modules/workspaces/workspaces.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      SchemaEntity,
      SchemaVersionEntity,
      UserProjectEntity,
      ProjectInvitationEntity,
    ]),
    S3Module,
    UsersModule,
    MailModule,
    RedisModule,
    WorkspacesModule,
    SubscriptionsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
