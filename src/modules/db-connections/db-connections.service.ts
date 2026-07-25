import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DbConnectionEntity } from './entity/db-connection.entity';
import { ProjectDbConnectionEntity } from './entity/project-db-connection.entity';
import { CreateDbConnectionDto } from './dto/create-db-connection.dto';
import { UpdateDbConnectionDto } from './dto/update-db-connection.dto';
import { TestDbConnectionDto } from './dto/test-db-connection.dto';
import { ExecuteQueryDto, QueryResultDto } from './dto/execute-query.dto';
import { DbConnectionStatus } from '@/common/enums/db-connection.enum';
import { encrypt, decrypt } from './utils/encryption.util';
import {
  testConnection,
  ConnectParams,
  executeQuery,
} from './utils/db-connector.factory';
import {
  introspectSchema,
  listSchemas,
  IntrospectedTable,
} from './utils/introspect.util';
import { checkPermissions, PermissionMatrix } from './utils/permissions.util';
import {
  AiIngestionService,
  GenerateSqlPayload,
} from '../ai-ingestion/ai-ingestion.service';
import { GenerateSqlDto } from './dto/generate-sql.dto';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import * as crypto from 'crypto';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { UsageService } from '@/modules/usage/usage.service';

@Injectable()
export class DbConnectionsService {
  constructor(
    @InjectRepository(DbConnectionEntity)
    private readonly dbConnectionRepo: Repository<DbConnectionEntity>,
    @InjectRepository(ProjectDbConnectionEntity)
    private readonly projectDbConnectionRepo: Repository<ProjectDbConnectionEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepo: Repository<ProjectEntity>,
    private readonly aiIngestionService: AiIngestionService,
    private readonly workspacesService: WorkspacesService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageService: UsageService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────

  async create(userId: string, dto: CreateDbConnectionDto) {
    let workspaceId = dto.workspaceId;
    if (dto.projectId) {
      const project = await this.projectsRepo.findOne({
        where: { id: dto.projectId },
      });
      if (!project) throw new NotFoundException('Project not found');
      await this.workspacesService.assertResourceWorkspaceAccess(
        userId,
        project.workspaceId,
      );
      if (workspaceId && workspaceId !== project.workspaceId) {
        throw new BadRequestException(
          'Project and DB connection must use the same workspace',
        );
      }
      workspaceId = project.workspaceId;
    }
    const workspace = workspaceId
      ? await this.workspacesService.assertCanCreateResources(
          userId,
          workspaceId,
        )
      : await this.workspacesService.getPersonalWorkspace(userId);
    await this.subscriptionsService.assertDbConnectionQuota(workspace.id);
    const entity = this.dbConnectionRepo.create({
      createdBy: userId,
      workspaceId: workspace.id,
      name: dto.name,
      dbms: dto.dbms,
      method: dto.method,
      host: dto.host,
      port: dto.port ?? null,
      database: dto.database,
      username: dto.username ?? null,
      passwordEncrypted: dto.password ? encrypt(dto.password) : null,
      ssl: dto.ssl ?? false,
      sshHost: dto.sshHost ?? null,
      sshPort: dto.sshPort ?? null,
      sshUsername: dto.sshUsername ?? null,
      sshAuthType: dto.sshAuthType ?? null,
      sshPasswordEncrypted: dto.sshPassword ? encrypt(dto.sshPassword) : null,
      sshPrivateKeyEncrypted: dto.sshPrivateKey
        ? encrypt(dto.sshPrivateKey)
        : null,
    });

    const saved = await this.dbConnectionRepo.save(entity);

    // Auto-link to project if projectId is provided
    if (dto.projectId) {
      await this.linkToProject(userId, dto.projectId, saved.id);
    }

    return this.sanitize(saved);
  }

  async findAll(userId: string, workspaceId?: string) {
    if (workspaceId) {
      await this.workspacesService.assertActiveMember(userId, workspaceId);
    }
    const connections = await this.dbConnectionRepo.find({
      where: workspaceId ? { workspaceId } : { createdBy: userId },
      order: { createdAt: 'DESC' },
    });
    return connections.map((c) => this.sanitize(c));
  }

  async findAllByUser(userId: string) {
    return this.findAll(userId);
  }

  async findByProject(projectId: string) {
    const links = await this.projectDbConnectionRepo.find({
      where: { projectId },
      relations: ['dbConnection'],
      order: { linkedAt: 'DESC' },
    });
    return links.map((l) => ({
      ...this.sanitize(l.dbConnection),
      linkedAt: l.linkedAt,
    }));
  }

  async findOne(userId: string, connId: string) {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');
    return this.sanitize(conn);
  }

  async update(userId: string, connId: string, dto: UpdateDbConnectionDto) {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    if (dto.name !== undefined) conn.name = dto.name;
    if (dto.dbms !== undefined) conn.dbms = dto.dbms;
    if (dto.method !== undefined) conn.method = dto.method;
    if (dto.host !== undefined) conn.host = dto.host;
    if (dto.port !== undefined) conn.port = dto.port ?? null;
    if (dto.database !== undefined) conn.database = dto.database;
    if (dto.username !== undefined) conn.username = dto.username ?? null;
    if (dto.password !== undefined)
      conn.passwordEncrypted = dto.password ? encrypt(dto.password) : null;
    if (dto.ssl !== undefined) conn.ssl = dto.ssl;
    if (dto.sshHost !== undefined) conn.sshHost = dto.sshHost ?? null;
    if (dto.sshPort !== undefined) conn.sshPort = dto.sshPort ?? null;
    if (dto.sshUsername !== undefined)
      conn.sshUsername = dto.sshUsername ?? null;
    if (dto.sshAuthType !== undefined)
      conn.sshAuthType = dto.sshAuthType ?? null;
    if (dto.sshPassword !== undefined)
      conn.sshPasswordEncrypted = dto.sshPassword
        ? encrypt(dto.sshPassword)
        : null;
    if (dto.sshPrivateKey !== undefined)
      conn.sshPrivateKeyEncrypted = dto.sshPrivateKey
        ? encrypt(dto.sshPrivateKey)
        : null;

    // Reset status when config changes
    conn.status = DbConnectionStatus.Untested;

    const saved = await this.dbConnectionRepo.save(conn);
    return this.sanitize(saved);
  }

  async remove(userId: string, connId: string) {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    await this.dbConnectionRepo.remove(conn);
  }

  // ─── Link / Unlink ────────────────────────────────────

  async linkToProject(userId: string, projectId: string, connId: string) {
    // Verify that the connection belongs to the user
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.workspaceId !== conn.workspaceId) {
      throw new BadRequestException(
        'A DB connection can only be linked within its workspace',
      );
    }

    const existing = await this.projectDbConnectionRepo.findOne({
      where: { projectId, dbConnectionId: connId },
    });
    if (existing) throw new ConflictException('Connection already linked');

    const link = this.projectDbConnectionRepo.create({
      projectId,
      dbConnectionId: connId,
    });
    return this.projectDbConnectionRepo.save(link);
  }

  async unlinkFromProject(userId: string, projectId: string, connId: string) {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    const link = await this.projectDbConnectionRepo.findOne({
      where: { projectId, dbConnectionId: connId },
    });
    if (!link) throw new NotFoundException('Link not found');

    await this.projectDbConnectionRepo.remove(link);
  }

  // ─── Test Connection ──────────────────────────────────

  async testUnsaved(dto: TestDbConnectionDto) {
    const params: ConnectParams = {
      dbms: dto.dbms,
      method: dto.method,
      host: dto.host,
      port: dto.port,
      database: dto.database,
      username: dto.username,
      password: dto.password,
      ssl: dto.ssl,
      sshHost: dto.sshHost,
      sshPort: dto.sshPort,
      sshUsername: dto.sshUsername,
      sshAuthType: dto.sshAuthType,
      sshPassword: dto.sshPassword,
      sshPrivateKey: dto.sshPrivateKey,
    };
    return testConnection(params);
  }

  async testSaved(userId: string, connId: string) {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    const params: ConnectParams = {
      dbms: conn.dbms,
      method: conn.method,
      host: conn.host,
      port: conn.port ?? undefined,
      database: conn.database,
      username: conn.username ?? undefined,
      password: conn.passwordEncrypted
        ? decrypt(conn.passwordEncrypted)
        : undefined,
      ssl: conn.ssl,
      sshHost: conn.sshHost ?? undefined,
      sshPort: conn.sshPort ?? undefined,
      sshUsername: conn.sshUsername ?? undefined,
      sshAuthType: conn.sshAuthType ?? undefined,
      sshPassword: conn.sshPasswordEncrypted
        ? decrypt(conn.sshPasswordEncrypted)
        : undefined,
      sshPrivateKey: conn.sshPrivateKeyEncrypted
        ? decrypt(conn.sshPrivateKeyEncrypted)
        : undefined,
    };

    const result = await testConnection(params);

    // Update status
    conn.status = result.success
      ? DbConnectionStatus.Connected
      : DbConnectionStatus.Failed;
    conn.lastTestedAt = new Date();
    await this.dbConnectionRepo.save(conn);

    return result;
  }

  async getPlainParams(userId: string, connId: string) {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    // Returns decrypted params so frontend can forward to local agent.
    // Only accessible by the connection owner over authenticated HTTPS.
    return {
      dbms: conn.dbms,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      password: conn.passwordEncrypted ? decrypt(conn.passwordEncrypted) : null,
      ssl: conn.ssl,
    };
  }

  // ─── Introspect ───────────────────────────────────────

  async listSchemas(userId: string, connId: string): Promise<string[]> {
    const conn = await this.dbConnectionRepo.findOne({ where: { id: connId } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    return listSchemas({
      dbms: conn.dbms,
      host: conn.host,
      port: conn.port ?? undefined,
      database: conn.database,
      username: conn.username ?? undefined,
      password: conn.passwordEncrypted
        ? decrypt(conn.passwordEncrypted)
        : undefined,
      ssl: conn.ssl,
    });
  }

  async introspect(
    userId: string,
    connId: string,
    schema?: string,
  ): Promise<IntrospectedTable[]> {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    return introspectSchema({
      dbms: conn.dbms,
      host: conn.host,
      port: conn.port ?? undefined,
      database: conn.database,
      username: conn.username ?? undefined,
      password: conn.passwordEncrypted
        ? decrypt(conn.passwordEncrypted)
        : undefined,
      ssl: conn.ssl,
      schema,
    });
  }

  // ─── AI Text-to-SQL ───────────────────────────────────

  async generateSql(
    userId: string,
    connId: string,
    dto: GenerateSqlDto,
  ): Promise<{ sql: string }> {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    const schemaTables = await introspectSchema({
      dbms: conn.dbms,
      host: conn.host,
      port: conn.port ?? undefined,
      database: conn.database,
      username: conn.username ?? undefined,
      password: conn.passwordEncrypted
        ? decrypt(conn.passwordEncrypted)
        : undefined,
      ssl: conn.ssl,
      schema: dto.schema,
    });

    const payload: GenerateSqlPayload = {
      nl_query: dto.nl_query,
      dbms: conn.dbms,
      schema_tables: schemaTables,
      project_id: dto.project_id,
    };

    const operationId = crypto.randomUUID();
    const reservation = await this.usageService.reserve(
      userId,
      conn.workspaceId,
      'ai_requests_monthly',
      operationId,
      1,
      { type: 'text_to_sql', connectionId: connId },
    );
    const configuredModel = reservation.metadata.modelName;
    if (typeof configuredModel !== 'string' || !configuredModel) {
      throw new Error('AI model was not resolved');
    }
    payload.model_name = configuredModel;
    try {
      const result = await this.aiIngestionService.generateSql(payload);
      await this.usageService.commit(operationId);
      await this.usageService
        .recordTokenUsage(operationId, {
          inputTokens: result.usage?.input_tokens ?? 0,
          outputTokens: result.usage?.output_tokens ?? 0,
          modelCalls: 1,
          modelName: result.usage?.model_name,
        })
        .catch(() => undefined);
      return { sql: result.sql };
    } catch (error) {
      await this.usageService.release(operationId);
      throw error;
    }
  }

  // ─── Execute Query ────────────────────────────────────

  async executeQuery(
    userId: string,
    connId: string,
    dto: ExecuteQueryDto,
  ): Promise<QueryResultDto> {
    const conn = await this.dbConnectionRepo.findOne({
      where: { id: connId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    const params: ConnectParams = {
      dbms: conn.dbms,
      method: conn.method,
      host: conn.host,
      port: conn.port ?? undefined,
      database: conn.database,
      username: conn.username ?? undefined,
      password: conn.passwordEncrypted
        ? decrypt(conn.passwordEncrypted)
        : undefined,
      ssl: conn.ssl,
    };

    return executeQuery(params, dto.query, dto.parameters, {
      timeoutMs: dto.timeoutMs,
      resultLimit: dto.resultLimit,
    });
  }

  // ─── Permissions ─────────────────────────────────────

  async checkPermissions(
    userId: string,
    connId: string,
  ): Promise<PermissionMatrix> {
    const conn = await this.dbConnectionRepo.findOne({ where: { id: connId } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.createdBy !== userId)
      throw new ForbiddenException('Not your connection');

    const params: ConnectParams = {
      dbms: conn.dbms,
      method: conn.method,
      host: conn.host,
      port: conn.port ?? undefined,
      database: conn.database,
      username: conn.username ?? undefined,
      password: conn.passwordEncrypted
        ? decrypt(conn.passwordEncrypted)
        : undefined,
      ssl: conn.ssl,
    };

    return checkPermissions(params);
  }

  // ─── Helpers ──────────────────────────────────────────

  private sanitize(conn: DbConnectionEntity) {
    return {
      id: conn.id,
      createdBy: conn.createdBy,
      workspaceId: conn.workspaceId,
      name: conn.name,
      dbms: conn.dbms,
      method: conn.method,
      status: conn.status,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      ssl: conn.ssl,
      sshHost: conn.sshHost,
      sshPort: conn.sshPort,
      sshUsername: conn.sshUsername,
      sshAuthType: conn.sshAuthType,
      lastTestedAt: conn.lastTestedAt,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
      // NEVER return encrypted credentials
    };
  }
}
