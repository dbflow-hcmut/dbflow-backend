import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { UsageModule } from '@/modules/usage/usage.module';
import { WorkspacesModule } from '@/modules/workspaces/workspaces.module';
import { AiGatewayController } from './ai-gateway.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity]),
    UsageModule,
    WorkspacesModule,
  ],
  controllers: [AiGatewayController],
})
export class AiGatewayModule {}
