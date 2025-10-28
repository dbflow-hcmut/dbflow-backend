import { Module } from '@nestjs/common';
import { AdminProjectsController } from './admin-projects.controller';

@Module({
  controllers: [AdminProjectsController],
})
export class AdminProjectsModule {}
