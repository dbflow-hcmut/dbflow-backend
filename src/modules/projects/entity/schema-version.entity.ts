import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SchemaEntity } from './schema.entity';

@Entity('schema_versions')
@Index(['schemaId', 'version'], { unique: true })
export class SchemaVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'schema_id', type: 'uuid', nullable: false })
  schemaId: string;

  @Column({ type: 'int', nullable: false })
  version: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ name: 's3_key', type: 'varchar', length: 512, nullable: false })
  s3Key: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: false })
  createdBy: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @ManyToOne(() => SchemaEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schema_id' })
  schema: SchemaEntity;
}
