import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BillingCycle, SubscriptionStatus } from '../subscription.enums';
import { PlanEntity } from './plan.entity';

@Entity('subscriptions')
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    enumName: 'subscription_status',
    default: SubscriptionStatus.Active,
  })
  status: SubscriptionStatus;

  @Column({
    name: 'billing_cycle',
    type: 'enum',
    enum: BillingCycle,
    enumName: 'billing_cycle',
  })
  billingCycle: BillingCycle;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string | null;

  @Column({ name: 'provider_customer_id', type: 'varchar', nullable: true })
  providerCustomerId: string | null;

  @Column({
    name: 'provider_subscription_id',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  providerSubscriptionId: string | null;

  @Column({ name: 'current_period_start', type: 'timestamptz' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamptz' })
  currentPeriodEnd: Date;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;

  @ManyToOne(() => PlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity;
}
