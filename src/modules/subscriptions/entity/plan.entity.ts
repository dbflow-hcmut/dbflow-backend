import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanWorkspaceType } from '../subscription.enums';

export type PlanLimits = Record<string, number | null>;
export type PlanFeatures = Record<string, boolean>;

@Entity('plans')
@Index(['code', 'version'], { unique: true })
export class PlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'workspace_type',
    type: 'enum',
    enum: PlanWorkspaceType,
    enumName: 'plan_workspace_type',
  })
  workspaceType: PlanWorkspaceType;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({
    name: 'monthly_base_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  monthlyBasePrice: string;

  @Column({
    name: 'yearly_base_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  yearlyBasePrice: string;

  @Column({
    name: 'monthly_seat_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  monthlySeatPrice: string | null;

  @Column({
    name: 'yearly_seat_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  yearlySeatPrice: string | null;

  @Column({ name: 'included_seats', type: 'integer', default: 1 })
  includedSeats: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  limits: PlanLimits;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  features: PlanFeatures;

  @Column({ name: 'ai_model', type: 'varchar', length: 120, nullable: true })
  aiModel: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt: Date;
}
