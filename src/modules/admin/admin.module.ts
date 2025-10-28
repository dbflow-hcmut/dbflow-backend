import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminProjectsModule } from './orders/admin-projects.module';

@Module({
  imports: [
    AdminUsersModule,
    AdminProjectsModule,
    RouterModule.register([
      {
        path: 'admin',
        children: [
          { path: 'users', module: AdminUsersModule },
          { path: 'projects', module: AdminProjectsModule },
        ],
      },
    ]),
  ],
})
export class AdminModule {}
