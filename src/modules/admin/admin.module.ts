import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminOrdersModule } from './orders/admin-orders.module';

@Module({
  imports: [
    AdminUsersModule,
    AdminOrdersModule,
    RouterModule.register([
      {
        path: 'admin',
        children: [
          { path: 'users', module: AdminUsersModule },
          { path: 'orders', module: AdminOrdersModule },
        ],
      },
    ]),
  ],
})
export class AdminModule {}
