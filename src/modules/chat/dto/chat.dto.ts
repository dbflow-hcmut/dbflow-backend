import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class CreateConversationDto {
  @ApiProperty({ description: 'Thread ID (UUID) from LangGraph' })
  @IsString()
  @IsNotEmpty()
  threadId: string;

  @ApiPropertyOptional({ description: 'Conversation title' })
  @IsString()
  @IsOptional()
  title?: string;
}

export class SaveMessagesDto {
  @ApiProperty({ type: [ChatMessageDto], description: 'Messages to save' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];
}

export class UpdateConversationTitleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;
}
