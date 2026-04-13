import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiOkResponse,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@/common/types/request.type';
import { ChatService } from './chat.service';
import {
  CreateConversationDto,
  SaveMessagesDto,
  UpdateConversationTitleDto,
} from './dto/chat.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Create a new conversation
   */
  @Post('conversations')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create a new chat conversation' })
  @ApiBody({ type: CreateConversationDto })
  async createConversation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateConversationDto,
  ) {
    try {
      const userId = req.user.id;
      return await this.chatService.createConversation(
        dto.threadId,
        userId,
        dto.title,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to create conversation');
    }
  }

  /**
   * Get all conversations for the current user
   */
  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get all chat conversations' })
  async getConversations(@Req() req: AuthenticatedRequest) {
    try {
      const userId = req.user.id;
      return await this.chatService.getConversations(userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to get conversations');
    }
  }

  /**
   * Get a single conversation with messages
   */
  @Get('conversations/:conversationId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get a conversation with messages' })
  async getConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.chatService.getConversation(conversationId, userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to get conversation');
    }
  }

  /**
   * Save messages to a conversation
   */
  @Post('conversations/:conversationId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Save messages to a conversation' })
  @ApiBody({ type: SaveMessagesDto })
  async saveMessages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() dto: SaveMessagesDto,
  ) {
    try {
      const userId = req.user.id;
      return await this.chatService.saveMessages(
        conversationId,
        userId,
        dto.messages,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to save messages');
    }
  }

  /**
   * Update conversation title
   */
  @Patch('conversations/:conversationId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update conversation title' })
  @ApiBody({ type: UpdateConversationTitleDto })
  async updateTitle(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() dto: UpdateConversationTitleDto,
  ) {
    try {
      const userId = req.user.id;
      return await this.chatService.updateTitle(
        conversationId,
        userId,
        dto.title,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to update conversation');
    }
  }

  /**
   * Delete a conversation
   */
  @Delete('conversations/:conversationId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Delete a conversation' })
  async deleteConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    try {
      const userId = req.user.id;
      await this.chatService.deleteConversation(conversationId, userId);
      return { message: 'Conversation deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to delete conversation');
    }
  }
}
