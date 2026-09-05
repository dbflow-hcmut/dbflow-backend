import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@/common/types/request.type';
import { ExportRecordsService } from './export-records.service';
import { CreateExportRecordDto } from './dto/create-export-record.dto';
import { TrackExportUsageDto } from './dto/track-export-usage.dto';

@ApiTags('Export Records')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/export-records')
export class ExportRecordsController {
  constructor(private readonly service: ExportRecordsService) {}

  @Get()
  @ApiOperation({ summary: 'List export records for a project' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.service.findByProject(req.user.id, projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an export record' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateExportRecordDto,
  ) {
    return this.service.create(req.user.id, projectId, dto);
  }

  @Post('usage')
  @ApiOperation({ summary: 'Record a completed client-side export' })
  async trackUsage(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: TrackExportUsageDto,
  ) {
    return this.service.trackClientExport(req.user.id, projectId, dto);
  }

  @Delete(':recordId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an export record' })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
  ) {
    await this.service.remove(req.user.id, projectId, recordId);
    return null;
  }

  @Post(':recordId/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply DOWN migration to rollback this export' })
  async rollback(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.service.rollback(req.user.id, projectId, recordId);
  }
}
