import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import {
  DbConnectionDbms,
  DbConnectionMethod,
  DbConnectionStatus,
  SshAuthType,
} from '@/common/enums/db-connection.enum';
import { WorkspaceEntity } from '@/modules/workspaces/entity/workspace.entity';

@Entity('db_connections')
export class DbConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: false })
  createdBy: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: false })
  workspaceId: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name: string;

  @Column({
    type: 'enum',
    enum: DbConnectionDbms,
    nullable: false,
  })
  dbms: DbConnectionDbms;

  @Column({
    type: 'enum',
    enum: DbConnectionMethod,
    nullable: false,
    default: DbConnectionMethod.Direct,
  })
  method: DbConnectionMethod;

  @Column({
    type: 'enum',
    enum: DbConnectionStatus,
    nullable: false,
    default: DbConnectionStatus.Untested,
  })
  status: DbConnectionStatus;

  @Column({ type: 'varchar', length: 255, nullable: false })
  host: string;

  @Column({ type: 'integer', nullable: true })
  port: number | null;

  @Column({ type: 'varchar', length: 255, nullable: false })
  database: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username: string | null;

  @Column({ name: 'password_encrypted', type: 'text', nullable: true })
  passwordEncrypted: string | null;

  @Column({ type: 'boolean', nullable: false, default: false })
  ssl: boolean;

  @Column({ name: 'ssh_host', type: 'varchar', length: 255, nullable: true })
  sshHost: string | null;

  @Column({ name: 'ssh_port', type: 'integer', nullable: true })
  sshPort: number | null;

  @Column({
    name: 'ssh_username',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  sshUsername: string | null;

  @Column({
    name: 'ssh_auth_type',
    type: 'enum',
    enum: SshAuthType,
    nullable: true,
  })
  sshAuthType: SshAuthType | null;

  @Column({
    name: 'ssh_password_encrypted',
    type: 'text',
    nullable: true,
  })
  sshPasswordEncrypted: string | null;

  @Column({
    name: 'ssh_private_key_encrypted',
    type: 'text',
    nullable: true,
  })
  sshPrivateKeyEncrypted: string | null;

  @Column({
    name: 'last_tested_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastTestedAt: Date | null;

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
  @JoinColumn({ name: 'created_by' })
  creator: UserEntity;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
}
