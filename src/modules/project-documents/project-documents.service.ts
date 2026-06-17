import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ProjectsService } from '@/modules/projects/projects.service';
import { S3Service } from '@/modules/s3/s3.service';
import {
  ProjectDocumentEntity,
  ProjectDocumentSource,
  ProjectDocumentStatus,
} from './entity/project-document.entity';
import {
  CreateProjectDocumentDto,
  UpdateProjectDocumentDto,
} from './dto/project-document.dto';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'application/sql',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/octet-stream',
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024;

@Injectable()
export class ProjectDocumentsService {
  constructor(
    @InjectRepository(ProjectDocumentEntity)
    private readonly documentsRepo: Repository<ProjectDocumentEntity>,
    private readonly projectsService: ProjectsService,
    private readonly s3Service: S3Service,
  ) {}

  async findAll(
    userId: string,
    projectId: string,
    query?: { keyword?: string },
  ) {
    await this.projectsService.checkViewPermission(userId, projectId);

    const where: Record<string, unknown> = { projectId };
    if (query?.keyword) {
      where.title = ILike(`%${query.keyword}%`);
    }

    return this.documentsRepo.find({
      where,
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreateProjectDocumentDto,
  ) {
    await this.projectsService.checkWritePermission(userId, projectId);
    this.validateFile(dto.mimeType, dto.size);
    this.validateDocumentKey(
      projectId,
      dto.s3Key,
      dto.source ?? ProjectDocumentSource.HubUpload,
    );

    const document = this.documentsRepo.create({
      projectId,
      uploadedBy: userId,
      title: dto.title,
      description: dto.description ?? null,
      fileName: dto.fileName,
      s3Key: dto.s3Key,
      mimeType: dto.mimeType,
      size: dto.size,
      source: dto.source ?? ProjectDocumentSource.HubUpload,
      status: ProjectDocumentStatus.Ready,
    });

    return this.documentsRepo.save(document);
  }

  async assertCanUpload(
    userId: string,
    projectId: string,
    mimeType: string,
    size: number,
  ) {
    await this.projectsService.checkWritePermission(userId, projectId);
    this.validateFile(mimeType, size);
  }

  async findOne(userId: string, projectId: string, documentId: string) {
    await this.projectsService.checkViewPermission(userId, projectId);
    const document = await this.documentsRepo.findOne({
      where: { id: documentId, projectId },
      relations: ['uploader'],
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async update(
    userId: string,
    projectId: string,
    documentId: string,
    dto: UpdateProjectDocumentDto,
  ) {
    await this.projectsService.checkWritePermission(userId, projectId);
    const document = await this.findOne(userId, projectId, documentId);

    if (dto.title !== undefined) document.title = dto.title;
    if (dto.description !== undefined) document.description = dto.description;

    return this.documentsRepo.save(document);
  }

  async remove(userId: string, projectId: string, documentId: string) {
    await this.projectsService.checkWritePermission(userId, projectId);
    const document = await this.findOne(userId, projectId, documentId);

    await this.documentsRepo.remove(document);
    await this.s3Service.deleteFile(document.s3Key).catch(() => undefined);
    return { success: true };
  }

  async getDownloadUrl(userId: string, projectId: string, documentId: string) {
    const document = await this.findOne(userId, projectId, documentId);
    const url = await this.s3Service.getPresignedUrl(document.s3Key);
    return { url };
  }

  private validateFile(mimeType: string, size: number) {
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) {
      throw new ForbiddenException('Invalid file size');
    }

    const normalizedMimeType = mimeType || 'text/plain';
    if (!ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
      throw new ForbiddenException('Unsupported file type');
    }
  }

  private validateDocumentKey(
    projectId: string,
    s3Key: string,
    source: ProjectDocumentSource,
  ) {
    const isProjectDocumentKey = s3Key.startsWith(
      `projects/${projectId}/documents/`,
    );

    if (source === ProjectDocumentSource.AiChatUpload) {
      if (!s3Key.startsWith('ai-attachments/') && !isProjectDocumentKey) {
        throw new ForbiddenException(
          'AI chat document must use an AI attachment key or project document key',
        );
      }
      return;
    }

    if (!isProjectDocumentKey) {
      throw new ForbiddenException(
        'Document file must be stored in project scope',
      );
    }
  }
}
