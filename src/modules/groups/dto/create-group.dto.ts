import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ example: 'Backend Team' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
