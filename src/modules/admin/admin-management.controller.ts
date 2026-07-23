import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums/role.enum';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { BillingService } from '@/modules/billing/billing.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@ApiTags('admin')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin')
export class AdminManagementController {
  constructor(
    private readonly adminService: AdminService,
    private readonly billingService: BillingService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('analytics/overview')
  overviewAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bucket') bucket?: string,
  ) {
    return this.adminService.overviewAnalytics(from, to, bucket);
  }

  @Get('users')
  users(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
  ) {
    return this.adminService.listUsers(page, Math.min(limit, 100), keyword);
  }

  @Patch('users/:userId/status')
  updateUserStatus(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(req.user.id, userId, dto);
  }

  @Get('workspaces')
  workspaces() {
    return this.adminService.listWorkspaces();
  }

  @Get('projects')
  projects() {
    return this.adminService.listProjects();
  }

  @Get('orders')
  orders() {
    return this.adminService.listOrders();
  }

  @Post('subscriptions/:subscriptionId/bills')
  createRenewalBill(@Param('subscriptionId') subscriptionId: string) {
    return this.billingService.createRenewalOrder(subscriptionId);
  }

  @Patch('orders/:orderId/cancel')
  cancelBill(@Param('orderId') orderId: string) {
    return this.billingService.cancelRenewalOrder(orderId);
  }

  @Get('subscriptions')
  subscriptions() {
    return this.adminService.listSubscriptions();
  }

  @Patch('subscriptions/:subscriptionId')
  updateSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.adminService.updateSubscription(
      req.user.id,
      subscriptionId,
      dto,
    );
  }

  @Get('plans')
  plans() {
    return this.adminService.listPlans();
  }

  @Post('plans')
  createPlan(@Req() req: AuthenticatedRequest, @Body() dto: CreatePlanDto) {
    return this.adminService.createPlan(req.user.id, dto);
  }

  @Patch('plans/:planId')
  updatePlan(
    @Req() req: AuthenticatedRequest,
    @Param('planId') planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.adminService.updatePlan(req.user.id, planId, dto);
  }

  @Get('audit-logs')
  auditLogs() {
    return this.adminService.listAuditLogs();
  }
}
