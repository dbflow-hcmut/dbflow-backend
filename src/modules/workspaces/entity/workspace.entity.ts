import { UserEntity } from '@/modules/users/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceStatus, WorkspaceType } from '../workspace.enums';
import { WorkspaceMemberEntity } from './workspace-member.entity';

@Entity('workspaces')
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: WorkspaceType, enumName: 'workspace_type' })
  type: WorkspaceType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({
    type: 'enum',
    enum: WorkspaceStatus,
    enumName: 'workspace_status',
    default: WorkspaceStatus.Active,
  })
  status: WorkspaceStatus;

  @Column({ name: 'avatar_key', type: 'varchar', length: 1000, nullable: true })
  avatarKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_user_id' })
  owner: UserEntity;

  @OneToMany(() => WorkspaceMemberEntity, (member) => member.workspace)
  members: WorkspaceMemberEntity[];
}
