import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CommentEntity } from './entity/comment.entity';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(CommentEntity)
    private readonly commentRepo: Repository<CommentEntity>,
  ) {}

  async create(
    projectId: string,
    schemaId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<CommentEntity> {
    const comment = this.commentRepo.create({
      projectId,
      schemaId,
      userId,
      x: dto.x,
      y: dto.y,
      content: dto.content,
      parentId: dto.parentId || null,
      nodeId: dto.nodeId || null,
    });
    return this.commentRepo.save(comment);
  }

  async findBySchema(
    schemaId: string,
    includeResolved = false,
  ): Promise<CommentEntity[]> {
    const where: Record<string, unknown> = {
      schemaId,
      parentId: IsNull(),
    };
    if (!includeResolved) {
      where.resolved = false;
    }

    const comments = await this.commentRepo.find({
      where,
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    // TypeORM doesn't eagerly load "replies" via the entity relation,
    // so we load them manually
    const allReplies = await this.commentRepo.find({
      where: { schemaId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    const replyMap = new Map<string, CommentEntity[]>();
    for (const r of allReplies) {
      if (r.parentId) {
        const list = replyMap.get(r.parentId) || [];
        list.push(r);
        replyMap.set(r.parentId, list);
      }
    }

    for (const comment of comments) {
      (comment as CommentEntity & { replies: CommentEntity[] }).replies =
        replyMap.get(comment.id) || [];
    }

    // Strip sensitive fields from user objects
    for (const comment of comments) {
      if (comment.user) {
        delete (comment.user as Record<string, unknown>).password;
      }
      const replies = (comment as CommentEntity & { replies: CommentEntity[] }).replies;
      for (const reply of replies) {
        if (reply.user) {
          delete (reply.user as Record<string, unknown>).password;
        }
      }
    }

    return comments;
  }

  async update(
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentEntity> {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    // Only author can edit content; anyone can resolve
    if (dto.content !== undefined && comment.userId !== userId) {
      throw new ForbiddenException('Only the author can edit this comment');
    }
    if (dto.content !== undefined) comment.content = dto.content;
    if (dto.resolved !== undefined) comment.resolved = dto.resolved;
    return this.commentRepo.save(comment);
  }

  async remove(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) {
      throw new ForbiddenException('Only the author can delete this comment');
    }
    await this.commentRepo.remove(comment);
  }
}
