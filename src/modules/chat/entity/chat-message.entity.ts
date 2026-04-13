import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChatConversationEntity } from './chat-conversation.entity';

export type MessageRole = 'user' | 'assistant';

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: false })
  conversationId: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  role: MessageRole;

  @Column({ type: 'text', nullable: false })
  content: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @ManyToOne(() => ChatConversationEntity, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ChatConversationEntity;
}
