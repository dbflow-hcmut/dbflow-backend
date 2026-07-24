import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { WorkspaceRole } from '../workspace.enums';

export class InviteWorkspaceMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    enum: [
      WorkspaceRole.Admin,
      WorkspaceRole.Billing,
      WorkspaceRole.Member,
      WorkspaceRole.Viewer,
    ],
  })
  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;
}
