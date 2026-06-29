import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSchemaDto {
  @ApiProperty({ example: 'My Schema' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'postgresql',
    enum: ['postgresql', 'mysql', 'sqlserver'],
  })
  @IsOptional()
  @IsIn(['postgresql', 'mysql', 'sqlserver'])
  dbms?: string;
}
