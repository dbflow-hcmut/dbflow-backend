import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Project Name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}
