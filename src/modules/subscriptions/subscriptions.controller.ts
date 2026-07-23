import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'List active plans' })
  list() {
    return this.subscriptionsService.listPlans();
  }
}

@ApiTags('subscriptions')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscription')
  @ApiOperation({ summary: 'Get current workspace subscription' })
  getSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.subscriptionsService.getWorkspaceSubscription(
      req.user.id,
      workspaceId,
    );
  }

  @Get('entitlements')
  @ApiOperation({ summary: 'Get workspace plan, entitlements and seat usage' })
  getEntitlements(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.subscriptionsService.getEntitlements(req.user.id, workspaceId);
  }
}
