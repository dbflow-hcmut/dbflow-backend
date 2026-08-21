import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanEntity } from '@/modules/subscriptions/entity/plan.entity';
import { SubscriptionEntity } from '@/modules/subscriptions/entity/subscription.entity';
import { WorkspacesModule } from '@/modules/workspaces/workspaces.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { OrderEntity } from './entity/order.entity';
import { PaymentTransactionEntity } from './entity/payment-transaction.entity';
import { StripeService } from './stripe.service';
import { WorkspaceMemberEntity } from '@/modules/workspaces/entity/workspace-member.entity';
import { MailModule } from '@/modules/mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      PaymentTransactionEntity,
      PlanEntity,
      SubscriptionEntity,
      WorkspaceMemberEntity,
    ]),
    WorkspacesModule,
    MailModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, StripeService],
  exports: [BillingService],
})
export class BillingModule {}
