import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SchemaEntity } from '@/modules/projects/entity/schema.entity';

@Entity('schema_sandboxes')
export class SchemaSandboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'schema_id', type: 'uuid', nullable: false, unique: true })
  schemaId: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: false })
  projectId: string;

  @Column({ name: 's3_key', type: 'varchar', length: 512, nullable: false })
  s3Key: string;

  @Column({
    name: 'model_snapshot_s3_key',
    type: 'varchar',
    length: 512,
    nullable: false,
  })
  modelSnapshotS3Key: string;

  @Column({ name: 'built_from_model_hash', type: 'varchar', length: 64 })
  builtFromModelHash: string;

  @Column({ name: 'last_used_at', type: 'timestamptz', precision: 6 })
  lastUsedAt: Date;

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

  @ManyToOne(() => SchemaEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schema_id' })
  schema: SchemaEntity;
}
