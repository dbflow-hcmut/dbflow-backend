import { IsNotEmpty, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSchemaDto {
  @ApiProperty({ example: 'My Schema' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}
