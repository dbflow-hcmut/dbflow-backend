import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';

type AuthenticatedRequest = Request & { user: { id: string } };

@ApiTags('groups')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({
    summary: 'List groups in a workspace (any active member can read)',
  })
  list(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.groupsService.listGroups(req.user.id, workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a group (Owner/Admin only)' })
  create(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.createGroup(req.user.id, workspaceId, dto.name);
  }

  @Delete(':groupId')
  @ApiOperation({ summary: 'Delete a group (Owner/Admin only)' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.deleteGroup(req.user.id, workspaceId, groupId);
  }

  @Post(':groupId/members/:targetUserId')
  @ApiOperation({ summary: 'Add a workspace member to a group' })
  addMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.groupsService.addMember(
      req.user.id,
      workspaceId,
      groupId,
      targetUserId,
    );
  }

  @Delete(':groupId/members/:targetUserId')
  @ApiOperation({ summary: 'Remove a member from a group' })
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.groupsService.removeMember(
      req.user.id,
      workspaceId,
      groupId,
      targetUserId,
    );
  }
}
