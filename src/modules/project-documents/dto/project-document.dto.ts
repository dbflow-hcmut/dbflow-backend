import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProjectDocumentSource } from '../entity/project-document.entity';

export class CreateProjectDocumentDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  s3Key: string;

  @IsString()
  @MaxLength(120)
  mimeType: string;

  @IsNumber()
  size: number;

  @IsOptional()
  @IsEnum(ProjectDocumentSource)
  source?: ProjectDocumentSource;
}

export class UpdateProjectDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
