import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DbConnectionEntity } from './entity/db-connection.entity';
import { ProjectDbConnectionEntity } from './entity/project-db-connection.entity';
import { DbConnectionsController } from './db-connections.controller';
import { DbConnectionsService } from './db-connections.service';
import { AiIngestionModule } from '../ai-ingestion/ai-ingestion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DbConnectionEntity, ProjectDbConnectionEntity]),
    AiIngestionModule,
  ],
  controllers: [DbConnectionsController],
  providers: [DbConnectionsService],
  exports: [DbConnectionsService],
})
export class DbConnectionsModule {}
