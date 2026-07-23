import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export const CLIENT_EXPORT_KINDS = [
  'png',
  'svg',
  'pdf',
  'json',
  'sql',
  'html',
] as const;

export type ClientExportKind = (typeof CLIENT_EXPORT_KINDS)[number];

export class TrackExportUsageDto {
  @IsUUID()
  operation_id: string;

  @IsString()
  @MaxLength(20)
  @IsIn(CLIENT_EXPORT_KINDS)
  kind: ClientExportKind;
}
