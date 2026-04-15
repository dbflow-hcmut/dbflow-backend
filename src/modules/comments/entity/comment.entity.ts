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
import { SchemaEntity } from '@/modules/projects/entity/schema.entity';
import { UserEntity } from '@/modules/users/user.entity';

@Entity('comments')
@Index(['schemaId', 'resolved'])
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: false })
  projectId: string;

  @Column({ name: 'schema_id', type: 'uuid', nullable: false })
  schemaId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** Canvas X position */
  @Column({ name: 'x', type: 'float', nullable: false })
  x: number;

  /** Canvas Y position */
  @Column({ name: 'y', type: 'float', nullable: false })
  y: number;

  @Column({ type: 'text', nullable: false })
  content: string;

  /** Parent comment id for threaded replies */
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  /** Attached node ID (comment follows node when moved) */
  @Column({ name: 'node_id', type: 'varchar', length: 255, nullable: true })
  nodeId: string | null;

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

  @ManyToOne(() => SchemaEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schema_id' })
  schema: SchemaEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => CommentEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: CommentEntity | null;
}
