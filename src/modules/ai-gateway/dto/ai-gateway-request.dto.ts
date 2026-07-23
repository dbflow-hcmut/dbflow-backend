import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class AiGatewayRequestDto {
  @IsString()
  assistant_id: string;

  @IsObject()
  input: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stream_mode?: string[];
}
