import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ExportRecordStatus {
  Success = 'success',
  Partial = 'partial',
  Failed = 'failed',
}

export enum ExportRecordTrigger {
  Manual = 'manual',
  Auto = 'auto',
}

@Entity('export_records')
@Index(['projectId', 'createdAt'])
export class ExportRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: false })
  projectId: string;

  @Column({ name: 'connection_id', type: 'uuid', nullable: false })
  connectionId: string;

  @Column({ name: 'triggered_by', type: 'uuid', nullable: false })
  triggeredBy: string;

  @Column({
    type: 'enum',
    enum: ExportRecordTrigger,
    default: ExportRecordTrigger.Manual,
  })
  trigger: ExportRecordTrigger;

  @Column({
    type: 'enum',
    enum: ExportRecordStatus,
    default: ExportRecordStatus.Success,
  })
  status: ExportRecordStatus;

  @Column({ type: 'varchar', length: 50, nullable: false })
  dbms: string;

  @Column({ name: 'ddl_snapshot_before', type: 'text', nullable: false })
  ddlSnapshotBefore: string;

  @Column({ name: 'up_migration', type: 'text', nullable: false })
  upMigration: string;

  @Column({ name: 'down_migration', type: 'text', nullable: false })
  downMigration: string;

  @Column({ name: 'schema_version_ref', type: 'uuid', nullable: true })
  schemaVersionRef: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;
}
