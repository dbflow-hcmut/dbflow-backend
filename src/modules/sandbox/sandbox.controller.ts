import {
  Controller,
  Get,
  Post,
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
import { SandboxService } from './sandbox.service';
import { ExecuteSandboxQueryDto } from './dto/execute-sandbox-query.dto';

@ApiTags('Schema Sandbox')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/schemas/:schemaId/sandbox')
export class SandboxController {
  constructor(private readonly service: SandboxService) {}

  @Get('status')
  @ApiOperation({
    summary:
      "Read-only check of this schema's sandbox — whether it exists and is in sync with the current model, without provisioning it",
  })
  async status(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
  ) {
    return this.service.getSandboxStatus(req.user.id, projectId, schemaId);
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Run a query/seed statement against this schema's SQLite sandbox — provisions or drift-syncs the sandbox first",
  })
  async execute(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: ExecuteSandboxQueryDto,
  ) {
    return this.service.executeSandboxQuery(
      req.user.id,
      projectId,
      schemaId,
      dto.query,
      dto.resultLimit,
    );
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Wipe and re-provision this schema's sandbox from the current model",
  })
  async reset(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
  ) {
    return this.service.resetSandbox(req.user.id, projectId, schemaId);
  }
}
