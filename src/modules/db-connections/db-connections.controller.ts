import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@/common/types/request.type';
import { DbConnectionsService } from './db-connections.service';
import { CreateDbConnectionDto } from './dto/create-db-connection.dto';
import { UpdateDbConnectionDto } from './dto/update-db-connection.dto';
import { TestDbConnectionDto } from './dto/test-db-connection.dto';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { LinkDbConnectionDto } from './dto/link-db-connection.dto';
import { GenerateSqlDto } from './dto/generate-sql.dto';

@ApiTags('DB Connections')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class DbConnectionsController {
  constructor(private readonly service: DbConnectionsService) {}

  // ─── User-level (not project-scoped) ──────────────────

  @Post('db-connections')
  @ApiOperation({ summary: 'Create a new DB connection' })
  @ApiResponse({ status: 201, description: 'Connection created' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateDbConnectionDto,
  ) {
    return this.service.create(req.user.id, dto);
  }

  @Get('db-connections')
  @ApiOperation({ summary: 'List all connections owned by current user' })
  async findAllMine(@Req() req: AuthenticatedRequest) {
    return this.service.findAllByUser(req.user.id);
  }

  @Get('db-connections/:connId')
  @ApiOperation({ summary: 'Get a single connection detail' })
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
  ) {
    return this.service.findOne(req.user.id, connId);
  }

  @Patch('db-connections/:connId')
  @ApiOperation({ summary: 'Update a connection' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateDbConnectionDto,
  ) {
    return this.service.update(req.user.id, connId, dto);
  }

  @Delete('db-connections/:connId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a connection' })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
  ) {
    await this.service.remove(req.user.id, connId);
    return null;
  }

  // ─── Test connection ──────────────────────────────────

  @Post('db-connections/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a connection (unsaved)' })
  async testUnsaved(
    @Body(new ValidationPipe({ whitelist: true })) dto: TestDbConnectionDto,
  ) {
    return this.service.testUnsaved(dto);
  }

  @Post('db-connections/:connId/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a saved connection' })
  async testSaved(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
  ) {
    return this.service.testSaved(req.user.id, connId);
  }

  @Post('db-connections/:connId/plain-params')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get decrypted connection params for local agent forwarding (owner only)',
  })
  async getPlainParams(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
  ) {
    return this.service.getPlainParams(req.user.id, connId);
  }

  @Post('db-connections/:connId/schemas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List schemas available in a saved connection' })
  async listSchemas(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
  ) {
    return this.service.listSchemas(req.user.id, connId);
  }

  @Post('db-connections/:connId/introspect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Introspect tables from a saved connection' })
  async introspect(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
    @Query('schema') schema?: string,
  ) {
    return this.service.introspect(req.user.id, connId, schema);
  }

  @Post('db-connections/:connId/text-to-sql')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate SQL from natural language using DB schema + AI' })
  async generateSql(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: GenerateSqlDto,
  ) {
    return this.service.generateSql(req.user.id, connId, dto);
  }

  @Post('db-connections/:connId/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute a query against a saved connection' })
  async executeQuery(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: ExecuteQueryDto,
  ) {
    return this.service.executeQuery(req.user.id, connId, dto);
  }

  // ─── Permissions ─────────────────────────────────────

  @Post('db-connections/:connId/permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check permissions of the connected DB user' })
  async checkPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('connId') connId: string,
  ) {
    return this.service.checkPermissions(req.user.id, connId);
  }

  // ─── Project linking ──────────────────────────────────

  @Get('projects/:projectId/db-connections')
  @ApiOperation({ summary: 'List connections linked to a project' })
  async findByProject(@Param('projectId') projectId: string) {
    return this.service.findByProject(projectId);
  }

  @Post('projects/:projectId/db-connections/link')
  @ApiOperation({ summary: 'Link existing connection to project' })
  async linkToProject(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: LinkDbConnectionDto,
  ) {
    return this.service.linkToProject(
      req.user.id,
      projectId,
      dto.dbConnectionId,
    );
  }

  @Delete('projects/:projectId/db-connections/:connId/unlink')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink connection from project' })
  async unlinkFromProject(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('connId') connId: string,
  ) {
    await this.service.unlinkFromProject(req.user.id, projectId, connId);
    return null;
  }
}
