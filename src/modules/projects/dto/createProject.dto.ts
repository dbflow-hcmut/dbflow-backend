import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Workspace that owns the project. Defaults to the personal workspace.',
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiProperty({ example: 'Project Name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'A short description of the project' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Skip creating the default schema (useful when AI will create its own schema)',
  })
  @IsOptional()
  @IsBoolean()
  skipDefaultSchema?: boolean;
}
