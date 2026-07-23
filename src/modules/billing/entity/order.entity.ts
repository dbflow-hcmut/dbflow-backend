import { PlanEntity } from '@/modules/subscriptions/entity/plan.entity';
import { SubscriptionEntity } from '@/modules/subscriptions/entity/subscription.entity';
import { BillingCycle } from '@/modules/subscriptions/subscription.enums';
import { UserEntity } from '@/modules/users/user.entity';
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
import { OrderStatus } from '../billing.enums';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number', type: 'varchar', unique: true })
  orderNumber: string;

  @Column({ name: 'payos_order_code', type: 'bigint', unique: true })
  payosOrderCode: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId: string | null;

  @Column({
    name: 'workspace_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  workspaceName: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ name: 'renewal_period_start', type: 'timestamptz', nullable: true })
  renewalPeriodStart: Date | null;

  @Column({ name: 'renewal_period_end', type: 'timestamptz', nullable: true })
  renewalPeriodEnd: Date | null;

  @Column({
    name: 'billing_cycle',
    type: 'enum',
    enum: BillingCycle,
    enumName: 'billing_cycle',
  })
  billingCycle: BillingCycle;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency: string;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status' })
  status: OrderStatus;

  @Column({ name: 'payment_link_id', type: 'varchar', nullable: true })
  paymentLinkId: string | null;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity;

  @ManyToOne(() => PlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subscription_id' })
  subscription: SubscriptionEntity | null;
}
