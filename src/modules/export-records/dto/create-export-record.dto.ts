import { IsString, IsUUID, IsOptional, IsEnum } from 'class-validator';
import {
  ExportRecordTrigger,
  ExportRecordStatus,
} from '../entity/export-record.entity';

export class CreateExportRecordDto {
  @IsUUID()
  connection_id: string;

  @IsEnum(ExportRecordTrigger)
  trigger: ExportRecordTrigger;

  @IsEnum(ExportRecordStatus)
  status: ExportRecordStatus;

  @IsString()
  dbms: string;

  @IsString()
  ddl_snapshot_before: string;

  @IsString()
  up_migration: string;

  @IsString()
  down_migration: string;

  @IsUUID()
  @IsOptional()
  schema_version_ref?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
