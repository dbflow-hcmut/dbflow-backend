import {
  Body,
  Controller,
  Delete,
  Get,
  BadRequestException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@/common/types/request.type';
import { S3Service } from '@/modules/s3/s3.service';
import { PresignedUploadDto } from '@/modules/s3/dto/upload.dto';
import { ProjectDocumentsService } from './project-documents.service';
import {
  CreateProjectDocumentDto,
  UpdateProjectDocumentDto,
} from './dto/project-document.dto';

@ApiTags('project-documents')
@Controller('projects/:projectId/documents')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class ProjectDocumentsController {
  constructor(
    private readonly projectDocumentsService: ProjectDocumentsService,
    private readonly s3Service: S3Service,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get project documents' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.projectDocumentsService.findAll(req.user.id, projectId, {
      keyword,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create project document metadata' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectDocumentDto,
  ) {
    return this.projectDocumentsService.create(req.user.id, projectId, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a project document file to S3' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async upload(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    await this.projectDocumentsService.assertCanUpload(
      req.user.id,
      projectId,
      file.mimetype,
      file.size,
    );

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `projects/${projectId}/documents/${Date.now()}-${safeName}`;
    return this.s3Service.uploadFile(file, key);
  }

  @Post('presigned-upload')
  @ApiOperation({
    summary: 'Create presigned upload URL for a project document',
  })
  async createPresignedUpload(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: PresignedUploadDto,
  ) {
    await this.projectDocumentsService.assertCanUpload(
      req.user.id,
      projectId,
      dto.mimeType,
      dto.size,
    );

    const safeName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `projects/${projectId}/documents/${Date.now()}-${safeName}`;
    return this.s3Service.getPresignedUploadUrl(key, dto.mimeType);
  }

  @Get(':documentId')
  @ApiOperation({ summary: 'Get a project document' })
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.projectDocumentsService.findOne(
      req.user.id,
      projectId,
      documentId,
    );
  }

  @Patch(':documentId')
  @ApiOperation({ summary: 'Update project document metadata' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateProjectDocumentDto,
  ) {
    return this.projectDocumentsService.update(
      req.user.id,
      projectId,
      documentId,
      dto,
    );
  }

  @Delete(':documentId')
  @ApiOperation({ summary: 'Delete a project document' })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.projectDocumentsService.remove(
      req.user.id,
      projectId,
      documentId,
    );
  }

  @Post(':documentId/retry-ingest')
  @ApiOperation({
    summary: 'Retry AI ingestion for a failed or queued document',
  })
  async retryIngest(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.projectDocumentsService.retryIngest(
      req.user.id,
      projectId,
      documentId,
    );
  }

  @Get(':documentId/download-url')
  @ApiOperation({ summary: 'Get a presigned document download URL' })
  async getDownloadUrl(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.projectDocumentsService.getDownloadUrl(
      req.user.id,
      projectId,
      documentId,
    );
  }
}
