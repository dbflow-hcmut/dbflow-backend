import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Database Team' })
  @IsString()
  @Length(2, 100)
  name: string;
}
