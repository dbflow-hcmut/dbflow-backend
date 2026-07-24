import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetProjectDto {
  @ApiProperty({ required: false, format: 'uuid' })
  @IsUUID()
  @IsOptional()
  workspaceId?: string;

  @ApiProperty({ example: 'keyword', required: false })
  @IsString()
  @IsOptional()
  keyword?: string;

  @ApiProperty({ example: 1, required: false, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({ example: 10, required: false, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;

  // @ApiProperty({ example: 'active' })
  // @IsString()
  // @IsOptional()
  // @IsIn(['active', 'archived'])
  // status: 'active' | 'archived';
}
