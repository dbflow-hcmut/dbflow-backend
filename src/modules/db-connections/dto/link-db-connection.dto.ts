import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkDbConnectionDto {
  @ApiProperty({ example: 'uuid-of-db-connection' })
  @IsString()
  @IsNotEmpty()
  dbConnectionId: string;
}
