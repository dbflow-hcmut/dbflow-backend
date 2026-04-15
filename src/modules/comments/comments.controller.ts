import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@/common/types/request.type';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

@ApiTags('comments')
@Controller('projects/:projectId/schemas/:schemaId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create a comment on a schema canvas' })
  async create(
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.create(
      projectId,
      schemaId,
      req.user.id,
      dto,
    );
    return comment;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get all comments for a schema' })
  async findAll(
    @Param('schemaId') schemaId: string,
    @Query('includeResolved') includeResolved?: string,
  ) {
    const comments = await this.commentsService.findBySchema(
      schemaId,
      includeResolved === 'true',
    );
    return comments;
  }

  @Patch(':commentId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update a comment (content or resolved status)' })
  async update(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.update(
      commentId,
      req.user.id,
      dto,
    );
    return comment;
  }

  @Delete(':commentId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Delete a comment' })
  async remove(
    @Param('commentId') commentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.commentsService.remove(commentId, req.user.id);
    return { success: true };
  }
}
