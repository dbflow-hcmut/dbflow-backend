import { ApiProperty } from '@nestjs/swagger';
import { SchemaType } from '@/common/enums/schema-type.enum';
import { MetaResponseDto } from '@/common/dto/success-response.dto';

export class SchemaResponseDto {
  @ApiProperty({ example: '22fa572f-27d2-402b-8098-b4c9885f6815' })
  id: string;

  @ApiProperty({ example: 'ddddcbbd-6d3c-4990-b7d0-dc70b16b11b1' })
  projectId: string;

  @ApiProperty({ example: 'My Schema' })
  name: string;

  @ApiProperty({ enum: SchemaType, example: SchemaType.Conceptual })
  type: SchemaType;

  @ApiProperty({ example: '2025-11-22T10:55:09.619Z' })
  createdAt: Date;

  @ApiProperty({ example: '2025-11-22T10:55:09.619Z' })
  updatedAt: Date;
}

class CreateSchemaMetaDto {
  @ApiProperty({ example: 201 })
  statusCode: number;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class CreateSchemaSuccessResponseDto {
  @ApiProperty({ type: CreateSchemaMetaDto })
  meta: CreateSchemaMetaDto;

  @ApiProperty({ type: SchemaResponseDto })
  data: SchemaResponseDto;
}

export class GetAllSchemasSuccessResponseDto {
  @ApiProperty({ type: MetaResponseDto })
  meta: MetaResponseDto;

  @ApiProperty({ type: [SchemaResponseDto] })
  data: SchemaResponseDto[];
}

