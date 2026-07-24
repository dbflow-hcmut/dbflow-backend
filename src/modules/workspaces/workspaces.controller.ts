import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteWorkspaceMemberDto } from './dto/invite-workspace-member.dto';
import { TransferWorkspaceOwnershipDto } from './dto/transfer-workspace-ownership.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { UpdateWorkspaceMemberRoleDto } from './dto/update-workspace-member-role.dto';
import { WorkspacesService } from './workspaces.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@ApiTags('workspaces')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces for the current user' })
  list(@Req() req: AuthenticatedRequest) {
    return this.workspacesService.findAllForUser(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a team workspace' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.createTeam(req.user.id, dto);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Get a workspace for the current member' })
  get(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.findOneForUser(req.user.id, workspaceId);
  }

  @Patch(':workspaceId')
  @ApiOperation({ summary: 'Update workspace settings' })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(req.user.id, workspaceId, dto);
  }

  @Get(':workspaceId/members')
  @ApiOperation({ summary: 'List workspace members' })
  members(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.listMembers(req.user.id, workspaceId);
  }

  @Get(':workspaceId/invitations')
  @ApiOperation({ summary: 'List workspace invitations' })
  invitations(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.listInvitations(req.user.id, workspaceId);
  }

  @Post(':workspaceId/invitations')
  @ApiOperation({ summary: 'Invite a workspace member' })
  invite(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: InviteWorkspaceMemberDto,
  ) {
    return this.workspacesService.inviteMember(req.user.id, workspaceId, dto);
  }

  @Delete(':workspaceId/invitations/:invitationId')
  @ApiOperation({ summary: 'Revoke a pending workspace invitation' })
  revokeInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.workspacesService.revokeInvitation(
      req.user.id,
      workspaceId,
      invitationId,
    );
  }

  @Patch(':workspaceId/members/:targetUserId/role')
  @ApiOperation({ summary: 'Update a workspace member role' })
  updateMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: UpdateWorkspaceMemberRoleDto,
  ) {
    return this.workspacesService.updateMemberRole(
      req.user.id,
      workspaceId,
      targetUserId,
      dto,
    );
  }

  @Delete(':workspaceId/members/:targetUserId')
  @ApiOperation({ summary: 'Remove a workspace member' })
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.workspacesService.removeMember(
      req.user.id,
      workspaceId,
      targetUserId,
    );
  }

  @Post(':workspaceId/leave')
  @ApiOperation({ summary: 'Leave a team workspace' })
  leave(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.leaveWorkspace(req.user.id, workspaceId);
  }

  @Post(':workspaceId/transfer-ownership')
  @ApiOperation({ summary: 'Transfer team workspace ownership' })
  transferOwnership(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: TransferWorkspaceOwnershipDto,
  ) {
    return this.workspacesService.transferOwnership(
      req.user.id,
      workspaceId,
      dto,
    );
  }
}
