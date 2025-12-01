import { IsNotEmpty, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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
}
