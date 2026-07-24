import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('usage_counters')
export class UsageCounterEntity {
  @PrimaryColumn({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  metric: string;

  @PrimaryColumn({ name: 'period_key', type: 'varchar', length: 20 })
  periodKey: string;

  @Column({ type: 'bigint', default: 0 })
  used: string;

  @Column({ type: 'bigint', default: 0 })
  reserved: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt: Date;
}
