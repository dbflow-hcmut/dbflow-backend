import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '../workspace.enums';

export class UpdateWorkspaceMemberRoleDto {
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
