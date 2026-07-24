import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentTransactionStatus } from '../billing.enums';
import { OrderEntity } from './order.entity';

@Entity('payment_transactions')
export class PaymentTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ type: 'varchar', length: 50, default: 'payos' })
  provider: string;

  @Column({ name: 'provider_transaction_id', type: 'varchar', unique: true })
  providerTransactionId: string;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    enumName: 'payment_transaction_status',
  })
  status: PaymentTransactionStatus;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt: Date;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: OrderEntity;
}
