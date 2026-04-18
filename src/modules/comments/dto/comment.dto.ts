import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsUUID,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ description: 'Canvas X position' })
  @IsNumber()
  @IsNotEmpty()
  x: number;

  @ApiProperty({ description: 'Canvas Y position' })
  @IsNumber()
  @IsNotEmpty()
  y: number;

  @ApiProperty({ description: 'Comment text content' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Parent comment ID for replies' })
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Attached node ID for following node position',
  })
  @IsString()
  @IsOptional()
  nodeId?: string;
}

export class UpdateCommentDto {
  @ApiPropertyOptional({ description: 'Updated content' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ description: 'Mark as resolved' })
  @IsBoolean()
  @IsOptional()
  resolved?: boolean;
}

export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  schemaId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  x: number;

  @ApiProperty()
  y: number;

  @ApiProperty()
  content: string;

  @ApiPropertyOptional()
  parentId: string | null;

  @ApiProperty()
  resolved: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'User info' })
  user?: {
    id: string;
    fullName: string;
    email: string;
  };

  @ApiPropertyOptional({ description: 'Threaded replies' })
  replies?: CommentResponseDto[];
}
