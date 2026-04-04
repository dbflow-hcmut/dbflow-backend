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
import { UserEntity } from '@/modules/users/user.entity';
import { ProjectEntity } from './project.entity';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';
import { InviteStatus } from '@/common/enums/invite-status.enum';

@Entity('project_invitations')
@Index(['projectId', 'email', 'status'], { unique: true })
export class ProjectInvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: false })
  projectId: string;

  @Column({ name: 'email', type: 'varchar', nullable: false })
  email: string;

  @Column({ name: 'invited_user_id', type: 'uuid', nullable: true })
  invitedUserId: string | null;

  @Column({ name: 'inviter_user_id', type: 'uuid', nullable: false })
  inviterUserId: string;

  @Column({
    type: 'enum',
    enum: UserProjectPermission,
    nullable: false,
  })
  permission: UserProjectPermission;

  @Column({
    type: 'enum',
    enum: InviteStatus,
    nullable: false,
    default: InviteStatus.Pending,
  })
  status: InviteStatus;

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

  @ManyToOne(() => ProjectEntity, (project) => project.invitations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_user_id' })
  invitedUser: UserEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviter_user_id' })
  inviterUser: UserEntity;
}
