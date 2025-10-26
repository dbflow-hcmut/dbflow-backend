import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';

@Module({
  controllers: [AdminOrdersController],
})
export class AdminOrdersModule {}
