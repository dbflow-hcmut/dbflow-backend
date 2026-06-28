import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportRecordEntity } from './entity/export-record.entity';
import { ExportRecordsController } from './export-records.controller';
import { ExportRecordsService } from './export-records.service';
import { DbConnectionsModule } from '@/modules/db-connections/db-connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportRecordEntity]),
    DbConnectionsModule,
  ],
  controllers: [ExportRecordsController],
  providers: [ExportRecordsService],
  exports: [ExportRecordsService],
})
export class ExportRecordsModule {}
