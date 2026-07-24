import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { UsageCounterEntity } from './entity/usage-counter.entity';
import { UsageEventEntity } from './entity/usage-event.entity';
import { UsageService } from './usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageEventEntity, UsageCounterEntity]),
    SubscriptionsModule,
  ],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
