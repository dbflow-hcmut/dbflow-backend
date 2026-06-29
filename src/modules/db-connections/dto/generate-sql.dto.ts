import { IsString, IsOptional } from 'class-validator';

export class GenerateSqlDto {
  @IsString()
  nl_query: string;

  @IsOptional()
  @IsString()
  schema?: string;

  @IsOptional()
  @IsString()
  project_id?: string;
}

export class GenerateSqlResponseDto {
  sql: string;
}
