import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { UserEntity } from '@/modules/users/user.entity';

export enum ProjectDocumentSource {
  HubUpload = 'hub_upload',
  AiChatUpload = 'ai_chat_upload',
}

export enum ProjectDocumentStatus {
  Uploaded = 'uploaded',
  Processing = 'processing',
  Ready = 'ready',
  Failed = 'failed',
}

@Entity('project_documents')
@Index(['projectId', 'createdAt'])
export class ProjectDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: false })
  projectId: string;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: false })
  uploadedBy: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: false })
  fileName: string;

  @Column({ name: 's3_key', type: 'text', nullable: false })
  s3Key: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: false })
  mimeType: string;

  @Column({ type: 'integer', nullable: false })
  size: number;

  @Column({
    type: 'enum',
    enum: ProjectDocumentSource,
    enumName: 'project_document_source',
    nullable: false,
    default: ProjectDocumentSource.HubUpload,
  })
  source: ProjectDocumentSource;

  @Column({
    type: 'enum',
    enum: ProjectDocumentStatus,
    enumName: 'project_document_status',
    nullable: false,
    default: ProjectDocumentStatus.Ready,
  })
  status: ProjectDocumentStatus;

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

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: UserEntity;
}
