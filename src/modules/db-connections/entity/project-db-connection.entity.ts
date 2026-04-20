import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProjectEntity } from '@/modules/projects/entity/project.entity';
import { DbConnectionEntity } from './db-connection.entity';

@Entity('project_db_connections')
@Unique(['projectId', 'dbConnectionId'])
export class ProjectDbConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: false })
  projectId: string;

  @Column({ name: 'db_connection_id', type: 'uuid', nullable: false })
  dbConnectionId: string;

  @CreateDateColumn({
    name: 'linked_at',
    type: 'timestamptz',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  linkedAt: Date;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;

  @ManyToOne(() => DbConnectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'db_connection_id' })
  dbConnection: DbConnectionEntity;
}
