import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExportRecordEntity,
  ExportRecordStatus,
} from './entity/export-record.entity';
import { CreateExportRecordDto } from './dto/create-export-record.dto';
import { DbConnectionsService } from '@/modules/db-connections/db-connections.service';
import { executeQuery } from '@/modules/db-connections/utils/db-connector.factory';
import { DbConnectionMethod } from '@/common/enums/db-connection.enum';
import { UsageService } from '@/modules/usage/usage.service';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { ProjectsService } from '@/modules/projects/projects.service';
import { TrackExportUsageDto } from './dto/track-export-usage.dto';
import { randomUUID } from 'crypto';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';

export interface RollbackLogEntry {
  statement: string;
  status: 'ok' | 'error';
  error_message?: string;
  execution_time_ms: number;
}

export interface RollbackResult {
  status: ExportRecordStatus;
  statements_total: number;
  statements_succeeded: number;
  statements_failed: number;
  execution_time_ms: number;
  log: RollbackLogEntry[];
}

const MAX_RECORDS_PER_PROJECT = 50;

@Injectable()
export class ExportRecordsService {
  constructor(
    @InjectRepository(ExportRecordEntity)
    private readonly repo: Repository<ExportRecordEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepo: Repository<ProjectEntity>,
    private readonly dbConnectionsService: DbConnectionsService,
    private readonly usageService: UsageService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findByProject(
    userId: string,
    projectId: string,
  ): Promise<ExportRecordEntity[]> {
    await this.projectsService.checkViewPermission(userId, projectId);
    return this.repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: MAX_RECORDS_PER_PROJECT,
    });
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreateExportRecordDto,
  ): Promise<ExportRecordEntity> {
    const operationId = randomUUID();
    const project = await this.requireProject(projectId);
    await this.projectsService.checkWritePermission(userId, projectId);
    await this.subscriptionsService.assertFeatureForWorkspace(
      project.workspaceId,
      'export',
    );
    await this.usageService.reserve(
      userId,
      project.workspaceId,
      'exports_monthly',
      operationId,
      1,
      { projectId, kind: 'database' },
    );
    const record = this.repo.create({
      projectId,
      connectionId: dto.connection_id,
      triggeredBy: userId,
      trigger: dto.trigger,
      status: dto.status,
      dbms: dto.dbms,
      ddlSnapshotBefore: dto.ddl_snapshot_before,
      upMigration: dto.up_migration,
      downMigration: dto.down_migration,
      schemaVersionRef: dto.schema_version_ref ?? null,
      notes: dto.notes ?? null,
    });

    try {
      const saved = await this.repo.save(record);
      await this.usageService.commit(operationId);
      await this.purgeOldRecords(projectId);
      return saved;
    } catch (error) {
      await this.usageService.release(operationId).catch(() => undefined);
      throw error;
    }
  }

  async trackClientExport(
    userId: string,
    projectId: string,
    dto: TrackExportUsageDto,
  ) {
    const project = await this.requireProject(projectId);
    await this.projectsService.checkWritePermission(userId, projectId);
    await this.subscriptionsService.assertFeatureForWorkspace(
      project.workspaceId,
      'export',
    );
    await this.usageService.reserve(
      userId,
      project.workspaceId,
      'exports_monthly',
      dto.operation_id,
      1,
      { projectId, kind: dto.kind },
    );
    return this.usageService.commit(dto.operation_id);
  }

  async remove(
    userId: string,
    projectId: string,
    recordId: string,
  ): Promise<void> {
    await this.projectsService.checkWritePermission(userId, projectId);
    const record = await this.repo.findOne({
      where: { id: recordId, projectId },
    });
    if (!record) throw new NotFoundException('Export record not found');
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.subscriptionsService.assertFeatureForWorkspace(
      project.workspaceId,
      'rollback',
    );
    await this.repo.remove(record);
  }

  async rollback(userId: string, projectId: string, recordId: string) {
    await this.projectsService.checkWritePermission(userId, projectId);
    const record = await this.repo.findOne({
      where: { id: recordId, projectId },
    });
    if (!record) throw new NotFoundException('Export record not found');
    if (!record.downMigration?.trim()) {
      throw new BadRequestException('No DOWN migration available for rollback');
    }

    // Load connection credentials via DbConnectionsService
    const plainParams = await this.dbConnectionsService.getPlainParams(
      userId,
      record.connectionId,
    );

    const start = Date.now();
    const statements = splitStatements(record.downMigration);
    const log: RollbackLogEntry[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;

      const result = await executeQuery(
        {
          dbms: plainParams.dbms,
          method: DbConnectionMethod.Direct,
          host: plainParams.host,
          port: plainParams.port ?? undefined,
          database: plainParams.database,
          username: plainParams.username ?? undefined,
          password: plainParams.password ?? undefined,
          ssl: plainParams.ssl,
        },
        trimmed,
      );

      if (result.success) {
        succeeded++;
        log.push({
          statement: trimmed,
          status: 'ok',
          execution_time_ms: result.executionTimeMs,
        });
      } else {
        failed++;
        log.push({
          statement: trimmed,
          status: 'error',
          error_message: result.message,
          execution_time_ms: result.executionTimeMs,
        });
        // Stop on first error — same as forward export
        break;
      }
    }

    const status: ExportRecordStatus =
      failed > 0
        ? succeeded > 0
          ? ExportRecordStatus.Partial
          : ExportRecordStatus.Failed
        : ExportRecordStatus.Success;

    return {
      status,
      statements_total: statements.filter((s) => s.trim()).length,
      statements_succeeded: succeeded,
      statements_failed: failed,
      execution_time_ms: Date.now() - start,
      log,
    };
  }

  // ─── Helpers ──────────────────────────────────────────

  private async purgeOldRecords(projectId: string): Promise<void> {
    const all = await this.repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      select: ['id'],
    });

    if (all.length > MAX_RECORDS_PER_PROJECT) {
      const toDelete = all.slice(MAX_RECORDS_PER_PROJECT).map((r) => r.id);
      await this.repo.delete(toDelete);
    }
  }

  private async requireProject(projectId: string) {
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*\n|;\s*$/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s + ';');
}
