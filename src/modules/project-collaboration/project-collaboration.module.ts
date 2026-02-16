import { Module } from '@nestjs/common';
import { ProjectCollaborationService } from './project-collaboration.service';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '@/redis/redis.module';
import { ProjectsModule } from '../projects/projects.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    RedisModule,
    ProjectsModule,
    S3Module,
  ],
  providers: [ProjectCollaborationService],
  exports: [ProjectCollaborationService],
})
export class ProjectCollaborationModule { }
