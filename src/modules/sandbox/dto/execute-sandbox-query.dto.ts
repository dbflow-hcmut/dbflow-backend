import { IsNotEmpty, IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExecuteSandboxQueryDto {
  @ApiProperty({ example: 'SELECT * FROM users LIMIT 10' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  resultLimit?: number;
}
