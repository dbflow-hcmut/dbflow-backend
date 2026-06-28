import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsEnum,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SchemaType } from '@/common/enums/schema-type.enum';

export class CreateSchemaDto {
  @ApiProperty({ example: 'My Schema' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: SchemaType, example: SchemaType.Conceptual })
  @IsEnum(SchemaType)
  @IsNotEmpty()
  type: SchemaType;

  @ApiPropertyOptional({
    example: 'postgresql',
    enum: ['postgresql', 'mysql', 'sqlserver'],
  })
  @IsOptional()
  @IsIn(['postgresql', 'mysql', 'sqlserver'])
  dbms?: string;
}
