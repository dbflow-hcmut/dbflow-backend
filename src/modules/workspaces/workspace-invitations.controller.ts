import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AcceptWorkspaceInvitationDto } from './dto/accept-workspace-invitation.dto';
import { WorkspacesService } from './workspaces.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@ApiTags('workspace-invitations')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspace-invitations')
export class WorkspaceInvitationsController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post('accept')
  @ApiOperation({ summary: 'Accept a workspace invitation' })
  accept(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AcceptWorkspaceInvitationDto,
  ) {
    return this.workspacesService.acceptInvitation(req.user.id, dto.token);
  }
}
