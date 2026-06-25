import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiIngestionService } from './ai-ingestion.service';

@Module({
  imports: [ConfigModule],
  providers: [AiIngestionService],
  exports: [AiIngestionService],
})
export class AiIngestionModule {}
