import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AcceptWorkspaceInvitationDto {
  @ApiProperty()
  @IsString()
  @Length(32, 256)
  token: string;
}
