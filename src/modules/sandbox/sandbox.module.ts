import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchemaSandboxEntity } from './entity/schema-sandbox.entity';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { S3Module } from '@/modules/s3/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SchemaSandboxEntity]),
    ProjectsModule,
    S3Module,
  ],
  controllers: [SandboxController],
  providers: [SandboxService],
})
export class SandboxModule {}
