import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

type AuthenticatedRequest = Request & { user: { id: string } };

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  createCheckout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(req.user.id, dto);
  }

  @Get('workspaces/:workspaceId/orders')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  listOrders(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.billingService.listOrders(req.user.id, workspaceId);
  }

  @Patch('workspaces/:workspaceId/orders/:orderId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  cancelOrder(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.billingService.cancelOrder(req.user.id, workspaceId, orderId);
  }

  @Post('workspaces/:workspaceId/portal')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  createBillingPortal(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.billingService.createBillingPortal(req.user.id, workspaceId);
  }

  @Post('webhooks/stripe')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new Error('Stripe webhook raw body and signature are required');
    }
    return this.billingService.processWebhook(req.rawBody, signature);
  }
}
