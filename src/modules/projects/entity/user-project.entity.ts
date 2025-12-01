import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import { ProjectEntity } from './project.entity';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';

@Entity('user_projects')
export class UserProjectEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({
    type: 'enum',
    enum: UserProjectPermission,
    nullable: false,
  })
  permission: UserProjectPermission;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => ProjectEntity, (project) => project.userProjects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;
}

