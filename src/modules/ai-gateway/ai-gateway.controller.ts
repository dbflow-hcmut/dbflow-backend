import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { UsageService } from '@/modules/usage/usage.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { AiGatewayRequestDto } from './dto/ai-gateway-request.dto';

type AuthenticatedRequest = Request & { user: { id: string } };

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  modelName: string | null;
};

class StreamTokenCollector {
  private buffer = '';
  private readonly calls = new Map<string, Omit<TokenUsage, 'modelCalls'>>();

  consume(chunk: Uint8Array) {
    this.buffer += Buffer.from(chunk).toString('utf8');
    const events = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = events.pop() ?? '';
    for (const event of events) this.consumeEvent(event);
  }

  totals(): TokenUsage {
    let inputTokens = 0;
    let outputTokens = 0;
    const modelNames = new Set<string>();
    for (const usage of this.calls.values()) {
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      if (usage.modelName) modelNames.add(usage.modelName);
    }
    return {
      inputTokens,
      outputTokens,
      modelCalls: this.calls.size,
      modelName:
        modelNames.size === 1
          ? [...modelNames][0]
          : modelNames.size > 1
            ? 'multiple'
            : null,
    };
  }

  private consumeEvent(event: string) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    try {
      this.walk(JSON.parse(data));
    } catch {
      // The client still receives malformed/unknown upstream events unchanged.
    }
  }

  private walk(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach((item) => this.walk(item));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    const usage = this.readUsage(item);
    if (usage) {
      const id =
        typeof item.id === 'string'
          ? item.id
          : `${this.calls.size}:${usage.inputTokens}:${usage.outputTokens}`;
      const previous = this.calls.get(id);
      this.calls.set(id, {
        inputTokens: Math.max(previous?.inputTokens ?? 0, usage.inputTokens),
        outputTokens: Math.max(previous?.outputTokens ?? 0, usage.outputTokens),
        modelName: usage.modelName ?? previous?.modelName ?? null,
      });
    }
    Object.values(item).forEach((child) => this.walk(child));
  }

  private readUsage(
    item: Record<string, unknown>,
  ): Omit<TokenUsage, 'modelCalls'> | null {
    const direct = item.usage_metadata;
    const response = item.response_metadata;
    const nested =
      response && typeof response === 'object'
        ? (response as Record<string, unknown>).usage_metadata
        : null;
    const usage =
      direct && typeof direct === 'object'
        ? (direct as Record<string, unknown>)
        : nested && typeof nested === 'object'
          ? (nested as Record<string, unknown>)
          : null;
    if (!usage) return null;
    const inputTokens = Number(
      usage.input_tokens ?? usage.prompt_token_count ?? 0,
    );
    const outputTokens = Number(
      usage.output_tokens ?? usage.candidates_token_count ?? 0,
    );
    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
      return null;
    }
    const responseMetadata =
      response && typeof response === 'object'
        ? (response as Record<string, unknown>)
        : null;
    const rawModel =
      responseMetadata?.model_name ??
      responseMetadata?.model ??
      item.model_name ??
      item.model;
    const modelName =
      typeof rawModel === 'string'
        ? rawModel.replace(/^models\//, '').trim() || null
        : null;
    return { inputTokens, outputTokens, modelName };
  }
}

@ApiTags('ai-gateway')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-gateway')
export class AiGatewayController {
  private readonly langGraphBase =
    process.env.LANGGRAPH_API_URL || 'http://localhost:2024';

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectsRepo: Repository<ProjectEntity>,
    private readonly workspacesService: WorkspacesService,
    private readonly usageService: UsageService,
  ) {}

  @Post('threads')
  createThread(
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    return this.proxyJson(req, res, '/threads', body);
  }

  @Post('threads/:threadId/runs/stream')
  async stream(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('threadId') threadId: string,
    @Body() body: AiGatewayRequestDto,
  ): Promise<void> {
    const workspaceId = await this.resolveWorkspace(
      req.user.id,
      body.input.project_id,
      body.input.workspace_id,
    );
    const operationId = crypto.randomUUID();
    const reservation = await this.usageService.reserve(
      req.user.id,
      workspaceId,
      'ai_requests_monthly',
      operationId,
      1,
      { threadId, projectId: body.input.project_id ?? null },
    );
    const configuredModel = reservation.metadata.modelName;
    if (typeof configuredModel !== 'string' || !configuredModel) {
      throw new Error('AI model was not resolved');
    }
    const upstreamBody = {
      ...body,
      input: {
        ...body.input,
        model_name: configuredModel,
      },
    };

    const abortController = new AbortController();
    const tokenCollector = new StreamTokenCollector();
    req.on('close', () => abortController.abort());
    try {
      const upstream = await fetch(
        `${this.langGraphBase}/threads/${encodeURIComponent(threadId)}/runs/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(upstreamBody),
          signal: abortController.signal,
        },
      );
      if (!upstream.ok || !upstream.body) {
        await this.usageService.release(operationId);
        const text = await upstream.text().catch(() => upstream.statusText);
        res.status(upstream.status).send(text);
        return;
      }
      await this.usageService.commit(operationId);
      res.status(upstream.status);
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') || 'text/event-stream',
      );
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        tokenCollector.consume(value);
        res.write(Buffer.from(value));
      }
      await this.usageService
        .recordTokenUsage(operationId, tokenCollector.totals())
        .catch(() => undefined);
      res.end();
      return;
    } catch (error) {
      await this.usageService
        .recordTokenUsage(operationId, tokenCollector.totals())
        .catch(() => undefined);
      await this.usageService.release(operationId).catch(() => undefined);
      if (!res.headersSent) {
        res.status(502).json({
          message:
            error instanceof Error
              ? error.message
              : 'AI gateway request failed',
        });
        return;
      }
      res.end();
    }
  }

  @Post('threads/:threadId/runs/:runId/cancel')
  cancel(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('threadId') threadId: string,
    @Param('runId') runId: string,
  ) {
    return this.proxyJson(
      req,
      res,
      `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/cancel`,
      {},
    );
  }

  private async resolveWorkspace(
    userId: string,
    projectId: unknown,
    workspaceId: unknown,
  ) {
    if (typeof projectId === 'string' && projectId) {
      const project = await this.projectsRepo.findOne({
        where: { id: projectId },
      });
      if (!project) throw new Error('Project not found');
      await this.workspacesService.assertResourceWorkspaceAccess(
        userId,
        project.workspaceId,
      );
      return project.workspaceId;
    }
    if (typeof workspaceId === 'string' && workspaceId) {
      await this.workspacesService.assertResourceWorkspaceAccess(
        userId,
        workspaceId,
      );
      return workspaceId;
    }
    throw new BadRequestException(
      'project_id or workspace_id is required to send an AI request',
    );
  }

  private async proxyJson(
    req: AuthenticatedRequest,
    res: Response,
    path: string,
    body: Record<string, unknown>,
  ) {
    void req;
    const upstream = await fetch(`${this.langGraphBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json',
    );
    res.send(text);
  }
}
