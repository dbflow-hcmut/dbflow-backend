import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UsageEventStatus {
  Reserved = 'reserved',
  Committed = 'committed',
  Released = 'released',
}

@Entity('usage_events')
export class UsageEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  metric: string;

  @Column({ type: 'bigint', default: 1 })
  quantity: string;

  @Index({ unique: true })
  @Column({ name: 'operation_id', type: 'varchar', length: 100 })
  operationId: string;

  @Column({ name: 'period_key', type: 'varchar', length: 20 })
  periodKey: string;

  @Column({
    type: 'enum',
    enum: UsageEventStatus,
    enumName: 'usage_event_status',
  })
  status: UsageEventStatus;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({ name: 'input_tokens', type: 'bigint', default: 0 })
  inputTokens: string;

  @Column({ name: 'output_tokens', type: 'bigint', default: 0 })
  outputTokens: string;

  @Column({ name: 'model_calls', type: 'integer', default: 0 })
  modelCalls: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt: Date;
}
