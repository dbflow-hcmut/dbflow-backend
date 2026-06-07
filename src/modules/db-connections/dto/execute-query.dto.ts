import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExecuteQueryDto {
  @ApiProperty({ example: 'SELECT * FROM users LIMIT 10' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({ example: ['value1', 'value2'] })
  @IsOptional()
  @IsArray()
  parameters?: unknown[];

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  timeoutMs?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  resultLimit?: number;
}

export class QueryResultDto {
  success: boolean;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
  executionTimeMs: number;
  message?: string;
}

