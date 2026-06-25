import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiIngestionModule } from '@/modules/ai-ingestion/ai-ingestion.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { S3Module } from '@/modules/s3/s3.module';
import { ProjectDocumentEntity } from './entity/project-document.entity';
import { ProjectDocumentsController } from './project-documents.controller';
import { ProjectDocumentsService } from './project-documents.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectDocumentEntity]),
    AiIngestionModule,
    ProjectsModule,
    S3Module,
  ],
  controllers: [ProjectDocumentsController],
  providers: [ProjectDocumentsService],
  exports: [ProjectDocumentsService],
})
export class ProjectDocumentsModule {}
