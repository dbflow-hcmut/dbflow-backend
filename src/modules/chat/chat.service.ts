import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatConversationEntity } from './entity/chat-conversation.entity';
import { ChatMessageEntity } from './entity/chat-message.entity';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatConversationEntity)
    private readonly conversationRepo: Repository<ChatConversationEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
  ) {}

  /**
   * Create or get a conversation
   */
  async createConversation(
    threadId: string,
    userId: string,
    title?: string,
  ): Promise<ChatConversationEntity> {
    // Check if conversation already exists
    const existing = await this.conversationRepo.findOne({
      where: { id: threadId },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('You do not own this conversation');
      }
      return existing;
    }

    const conversation = this.conversationRepo.create({
      id: threadId,
      userId,
      title: title || 'New Chat',
    });

    return this.conversationRepo.save(conversation);
  }

  /**
   * Get all conversations for a user, ordered by most recent
   */
  async getConversations(userId: string): Promise<ChatConversationEntity[]> {
    return this.conversationRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Get a single conversation with messages
   */
  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ChatConversationEntity> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['messages'],
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('You do not own this conversation');
    }

    return conversation;
  }

  /**
   * Save messages to a conversation
   */
  async saveMessages(
    conversationId: string,
    userId: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<ChatMessageEntity[]> {
    // Verify ownership
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('You do not own this conversation');
    }

    const entities = messages.map((msg) =>
      this.messageRepo.create({
        conversationId,
        role: msg.role,
        content: msg.content,
      }),
    );

    const saved = await this.messageRepo.save(entities);

    // Auto-update title from first user message if still default
    if (conversation.title === 'New Chat') {
      const firstUserMsg = messages.find((m) => m.role === 'user');
      if (firstUserMsg) {
        const autoTitle =
          firstUserMsg.content.length > 80
            ? firstUserMsg.content.substring(0, 80) + '...'
            : firstUserMsg.content;
        await this.conversationRepo.update(conversationId, { title: autoTitle });
      }
    }

    // Touch updatedAt
    await this.conversationRepo.update(conversationId, {});

    return saved;
  }

  /**
   * Update conversation title
   */
  async updateTitle(
    conversationId: string,
    userId: string,
    title: string,
  ): Promise<ChatConversationEntity> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('You do not own this conversation');
    }

    conversation.title = title;
    return this.conversationRepo.save(conversation);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('You do not own this conversation');
    }

    await this.conversationRepo.remove(conversation);
  }
}
