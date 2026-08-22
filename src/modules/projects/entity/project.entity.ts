import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import { ProjectVisibility } from '@/common/enums/project-visibility.enum';
import { UserProjectEntity } from './user-project.entity';
import { ProjectInvitationEntity } from './project-invitation.entity';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';
import { GroupEntity } from '@/modules/groups/entity/group.entity';

@Entity('projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid', nullable: false })
  ownerId: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: false })
  workspaceId: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
    default: 'Untitled Diagram',
  })
  name: string;

  @Column({
    type: 'text',
    nullable: true,
    default: null,
  })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ProjectVisibility,
    nullable: false,
    default: ProjectVisibility.OwnerAndInvited,
  })
  visibility: ProjectVisibility;

  // Team-workspace scoping only (see `groups` module). Ignored for Personal
  // workspace projects, which keep using `visibility` above instead.
  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

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

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: UserEntity;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;

  @ManyToOne(() => GroupEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: GroupEntity | null;

  @OneToMany(() => UserProjectEntity, (userProject) => userProject.project)
  userProjects: UserProjectEntity[];

  @OneToMany(() => ProjectInvitationEntity, (invitation) => invitation.project)
  invitations: ProjectInvitationEntity[];
}
