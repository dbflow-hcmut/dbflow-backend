import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Entity('chat_conversations')
export class ChatConversationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string; // This is the LangGraph thread_id

  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
    default: 'New Chat',
  })
  title: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'schema_id', type: 'uuid', nullable: true })
  schemaId: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @OneToMany(() => ChatMessageEntity, (message) => message.conversation)
  messages: ChatMessageEntity[];
}
