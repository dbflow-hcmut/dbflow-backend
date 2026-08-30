import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/createProject.dto';
import { GetProjectDto } from './dto/getProject.dto';
import { CreateSchemaDto } from './dto/createSchema.dto';
import { InviteUsersDto } from './dto/inviteUsers.dto';
import { Repository } from 'typeorm';
import { ProjectEntity } from './entity/project.entity';
import { SchemaEntity } from './entity/schema.entity';
import { SchemaVersionEntity } from './entity/schema-version.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserProjectEntity } from './entity/user-project.entity';
import { ProjectInvitationEntity } from './entity/project-invitation.entity';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';
import { InviteStatus } from '@/common/enums/invite-status.enum';
import { S3Service } from '../s3/s3.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { SchemaType } from '@/common/enums/schema-type.enum';
import { ProjectVisibility } from '@/common/enums/project-visibility.enum';
import { resolveAvatarUrl } from '@/common/utils/avatar.util';
import Redis from 'ioredis';
import * as Y from 'yjs';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import {
  WorkspaceRole,
  WorkspaceType,
} from '@/modules/workspaces/workspace.enums';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { GroupsService } from '@/modules/groups/groups.service';

const logger = new Logger('ProjectsService');

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(UserProjectEntity)
    private readonly userProjectsRepository: Repository<UserProjectEntity>,
    @InjectRepository(ProjectInvitationEntity)
    private readonly projectInvitationsRepository: Repository<ProjectInvitationEntity>,
    @InjectRepository(SchemaEntity)
    private readonly schemasRepository: Repository<SchemaEntity>,
    @InjectRepository(SchemaVersionEntity)
    private readonly schemaVersionsRepository: Repository<SchemaVersionEntity>,
    private readonly s3Service: S3Service,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    private readonly workspacesService: WorkspacesService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly groupsService: GroupsService,
  ) {}

  async createProject(userId: string, dto: CreateProjectDto) {
    if (!dto.workspaceId) {
      throw new BadRequestException(
        'workspaceId is required to create a project',
      );
    }
    const workspace = await this.workspacesService.assertCanCreateResources(
      userId,
      dto.workspaceId,
    );
    await this.subscriptionsService.assertProjectQuota(workspace.id);

    let groupId: string | null = null;
    if (dto.groupId) {
      if (workspace.type !== WorkspaceType.Team) {
        throw new BadRequestException(
          'Groups only apply to Team workspace projects',
        );
      }
      await this.assertGroupAssignable(userId, workspace.id, dto.groupId);
      groupId = dto.groupId;
    }

    const project = await this.projectsRepository.save({
      ownerId: userId,
      workspaceId: workspace.id,
      name: dto.name,
      description: dto.description ?? null,
      groupId,
      // `visibility` only governs access for Personal workspace projects —
      // Team workspace access is decided by workspace role + Group (see
      // checkViewPermission/checkWritePermission), so the default here is
      // inert for Team and just kept for schema simplicity.
    });

    // Personal workspace still uses the per-user ACL table; Team workspace
    // access is derived from workspace role + Group, so no row is needed.
    if (workspace.type !== WorkspaceType.Team) {
      await this.userProjectsRepository.save({
        userId: userId,
        projectId: project.id,
        permission: UserProjectPermission.Editor,
      });
    }

    if (!dto.skipDefaultSchema) {
      await this.createSchema(userId, project.id, {
        name: 'Untitled Diagram',
        type: SchemaType.Conceptual,
      });
    }

    const projectWithOwner = await this.projectsRepository.findOne({
      where: { id: project.id },
      relations: ['owner'],
    });

    if (!projectWithOwner) {
      throw new NotFoundException('Project not found');
    }

    return this.formatProjectResponse(projectWithOwner);
  }

  /** Personal projects use owner/user_projects ACL. Team projects use only
   * active workspace role + Group membership; being their creator does not
   * bypass Group visibility.
   */
  async getAllProjects(userId: string, query?: GetProjectDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 9;
    const skip = (page - 1) * limit;

    const queryBuilder = this.projectsRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .where(
        `(
          (
            EXISTS (
              SELECT 1 FROM workspaces personal_workspace
              WHERE personal_workspace.id = project.workspace_id
                AND personal_workspace.type = 'personal'
            )
            AND (
              project.owner_id = :userId
              OR EXISTS (
                SELECT 1 FROM user_projects up
                WHERE up.project_id = project.id AND up.user_id = :userId
              )
            )
          )
          OR EXISTS (
            SELECT 1 FROM workspace_members team_member
            JOIN workspaces team_workspace
              ON team_workspace.id = team_member.workspace_id
              AND team_workspace.type = 'team'
            WHERE team_member.workspace_id = project.workspace_id
              AND team_member.user_id = :userId
              AND team_member.status = 'active'
              AND (
                team_member.role IN ('owner', 'admin')
                OR project.group_id IS NULL
                OR EXISTS (
                  SELECT 1 FROM group_members gm
                  WHERE gm.group_id = project.group_id
                    AND gm.user_id = :userId
                )
              )
          )
        )`,
        { userId },
      );

    if (query?.workspaceId) {
      await this.workspacesService.assertActiveMember(
        userId,
        query.workspaceId,
      );
      queryBuilder.andWhere('project.workspaceId = :workspaceId', {
        workspaceId: query.workspaceId,
      });
    }

    if (query?.keyword) {
      queryBuilder.andWhere('project.name ILIKE :keyword', {
        keyword: `%${query.keyword}%`,
      });
    }

    if (query?.groupId) {
      queryBuilder.andWhere('project.group_id = :groupId', {
        groupId: query.groupId,
      });
    }

    const total = await queryBuilder.getCount();

    const projects = await queryBuilder
      .orderBy('project.updatedAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const items = projects.map((project) =>
      this.formatProjectResponse(project),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  private formatProjectResponse(project: ProjectEntity) {
    const owner = project.owner;
    // "owner" is kept for backward compatibility; for Team-workspace
    // projects it no longer means sole authority (see checkOwnership) — it's
    // just who created it, surfaced again as `createdBy` for clients that
    // want to stop presenting it as an ownership/authority field.
    const personSummary = {
      id: owner.id,
      name: owner.fullName,
      email: owner.email,
      avatar: resolveAvatarUrl(owner, this.s3Service),
    };

    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      owner: personSummary,
      createdBy: personSummary,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      visibility: project.visibility,
      groupId: project.groupId,
      status: 'active',
    };
  }

  async getProjectInformation(userId: string, projectId: string) {
    await this.checkViewPermission(userId, projectId);

    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: ['owner'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
    // Auto-add user to members if accessing public project
    if (userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    return this.formatProjectResponse(project);
  }

  private async ensureUserMembership(
    userId: string,
    projectId: string,
    visibility: ProjectVisibility,
  ): Promise<void> {
    // Only auto-add for public projects
    if (
      visibility !== ProjectVisibility.AnyoneCanView &&
      visibility !== ProjectVisibility.AnyoneCanEdit
    ) {
      return;
    }

    // Check if user is already a member
    const existingMember = await this.userProjectsRepository.findOne({
      where: { userId, projectId },
    });

    if (existingMember) {
      return; // User already has membership
    }

    // Add user with appropriate permission based on project visibility
    const permission =
      visibility === ProjectVisibility.AnyoneCanEdit
        ? UserProjectPermission.Editor
        : UserProjectPermission.Viewer;

    await this.userProjectsRepository.save({
      userId,
      projectId,
      permission,
    });

    logger.log(
      `Auto-added user ${userId} to public project ${projectId} with ${permission} permission`,
    );
  }

  async deleteProject(userId: string, projectId: string) {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // The creator, or a Team workspace's Owner/Admin, can fully delete the
    // project (it belongs to the team, not just to whoever made it).
    const canDelete =
      project.ownerId === userId ||
      (await this.workspacesService.isOwnerOrAdmin(
        userId,
        project.workspaceId,
      ));

    if (canDelete) {
      // Get all schemas for this project
      const schemas = await this.schemasRepository.find({
        where: { projectId },
      });

      // Delete all schema files from S3
      const s3DeletePromises = schemas.map(async (schema) => {
        const currentVersionPrefix = `projects/${projectId}/schemas/${schema.id}/latest`;
        const diagramS3Key = `${currentVersionPrefix}/diagram.schema.json`;
        const modelS3Key = `${currentVersionPrefix}/model.schema.json`;

        await Promise.allSettled([
          this.s3Service.deleteFile(diagramS3Key),
          this.s3Service.deleteFile(modelS3Key),
        ]);
      });

      await Promise.allSettled(s3DeletePromises);

      // Delete schemas
      await this.schemasRepository.delete({ projectId });

      // Delete user-project relationships
      await this.userProjectsRepository.delete({ projectId });

      // Delete pending invitations
      await this.projectInvitationsRepository.delete({ projectId });

      // Delete the project
      await this.projectsRepository.delete({ id: projectId });

      logger.log(
        `Project ${projectId} deleted successfully by owner ${userId}`,
      );

      return { message: 'Project deleted successfully', isOwner: true };
    } else {
      // If user is not owner, remove them from the project (leave project)
      const userProject = await this.userProjectsRepository.findOne({
        where: { userId, projectId },
      });

      if (!userProject) {
        throw new NotFoundException('You are not a member of this project');
      }

      // Remove user from project
      await this.userProjectsRepository.delete({ userId, projectId });

      // Also remove any pending invitations for this user
      const user = await this.usersService.findById(userId);
      if (user) {
        await this.projectInvitationsRepository.delete({
          projectId,
          email: user.email,
        });
      }

      logger.log(`User ${userId} left project ${projectId}`);

      return {
        message: 'You have left the project successfully',
        isOwner: false,
      };
    }
  }

  private async initializeSchemaTemplates(
    projectId: string,
    schemaId: string,
    schemaName: string,
    schemaType: SchemaType,
    dbms?: string,
  ) {
    const prefixMap: Record<SchemaType, string> = {
      [SchemaType.Conceptual]: 'cid',
      [SchemaType.Logical]: 'lid',
      [SchemaType.Physical]: 'pid',
    };
    const prefix = prefixMap[schemaType] || 'cid';

    const diagramTemplate = {
      diagram: {
        id: `${prefix}_diagram_${schemaId}`,
        name: schemaName,
        viewport: {
          x: 0,
          y: 0,
          zoom: 1,
          gridSize: 20,
          snapToGrid: true,
        },
        nodes: [],
        edges: [],
      },
    };

    let modelTemplate: Record<string, unknown>;

    if (schemaType === SchemaType.Conceptual) {
      modelTemplate = {
        model: {
          id: `${prefix}_model_${schemaId}`,
          name: schemaName,
          version: 1,
          notes: '',
        },
        entities: [],
        relationships: [],
        generalizations: [],
        categories: [],
        constraints: [],
        notes: '',
        tags: [],
        audit: {
          createdBy: '',
          createdAt: new Date().toISOString(),
          updatedBy: '',
          updatedAt: new Date().toISOString(),
        },
      };
    } else if (schemaType === SchemaType.Physical) {
      modelTemplate = {
        model: {
          id: `${prefix}_model_${schemaId}`,
          name: schemaName,
          version: 1,
          notes: '',
          ...(dbms ? { dbms } : {}),
        },
        tables: [],
        audit: {
          createdBy: '',
          createdAt: new Date().toISOString(),
          updatedBy: '',
          updatedAt: new Date().toISOString(),
        },
      };
    } else {
      modelTemplate = {
        model: {
          id: `${prefix}_model_${schemaId}`,
          name: schemaName,
          version: 1,
          notes: '',
        },
        tables: [],
        audit: {
          createdBy: '',
          createdAt: new Date().toISOString(),
          updatedBy: '',
          updatedAt: new Date().toISOString(),
        },
      };
    }

    const currentVersionPrefix = `projects/${projectId}/schemas/${schemaId}/latest`;
    const diagramS3Key = `${currentVersionPrefix}/diagram.schema.json`;
    const modelS3Key = `${currentVersionPrefix}/model.schema.json`;

    await this.s3Service.putJsonObject(diagramS3Key, diagramTemplate);
    await this.s3Service.putJsonObject(modelS3Key, modelTemplate);

    logger.log(
      `Initialized schema templates for schema ${schemaId} in S3: ${currentVersionPrefix}`,
    );
  }

  async getUserProjectPermission(
    userId: string,
    projectId: string,
  ): Promise<UserProjectEntity | null> {
    const userProject = await this.userProjectsRepository.findOne({
      where: { userId: userId, projectId: projectId },
    });

    return userProject;
  }

  /**
   * Team-workspace access rule (Group-based, replaces ProjectVisibility for
   * this branch): Owner/Admin always see everything; otherwise the project
   * must have no Group (whole team) or the caller must belong to its Group.
   * Returns the caller's workspace role so callers can also derive
   * edit-vs-view capability from it.
   */
  private async assertTeamProjectAccess(
    userId: string,
    project: ProjectEntity,
    workspaceId: string,
  ): Promise<WorkspaceRole> {
    const role = await this.workspacesService.getMembershipRole(
      userId,
      workspaceId,
    );
    if (!role) {
      throw new ForbiddenException(
        'User does not have permission to access this project',
      );
    }
    if (role === WorkspaceRole.Owner || role === WorkspaceRole.Admin) {
      return role;
    }
    if (project.groupId) {
      const inGroup = await this.groupsService.isUserInGroup(
        userId,
        project.groupId,
      );
      if (!inGroup) {
        throw new ForbiddenException(
          'User does not have permission to access this project',
        );
      }
    }
    return role;
  }

  async checkViewPermission(userId: string, projectId: string): Promise<void> {
    const projectInfo = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!projectInfo) {
      throw new NotFoundException('Project not found');
    }
    const workspace =
      await this.workspacesService.assertResourceWorkspaceAccess(
        userId,
        projectInfo.workspaceId,
      );

    if (workspace.type === WorkspaceType.Team) {
      await this.assertTeamProjectAccess(userId, projectInfo, workspace.id);
      return;
    }

    // Personal workspace: unchanged legacy visibility/user_projects logic.
    if (
      projectInfo.visibility === ProjectVisibility.AnyoneCanView ||
      projectInfo.visibility === ProjectVisibility.AnyoneCanEdit
    ) {
      return;
    }

    if (projectInfo.visibility === ProjectVisibility.OwnerAndInvited) {
      const userProject = await this.getUserProjectPermission(
        userId,
        projectId,
      );

      if (!userProject) {
        throw new ForbiddenException(
          'User does not have permission to access this project',
        );
      }

      if (
        userProject.permission !== UserProjectPermission.Viewer &&
        userProject.permission !== UserProjectPermission.Editor
      ) {
        throw new ForbiddenException(
          'User does not have permission to access this project',
        );
      }
      return;
    }

    throw new ForbiddenException(
      'User does not have permission to access this project',
    );
  }

  async checkWritePermission(userId: string, projectId: string): Promise<void> {
    const projectInfo = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!projectInfo) {
      throw new NotFoundException('Project not found');
    }
    const workspace =
      await this.workspacesService.assertResourceWorkspaceAccess(
        userId,
        projectInfo.workspaceId,
      );

    if (workspace.type === WorkspaceType.Team) {
      const role = await this.assertTeamProjectAccess(
        userId,
        projectInfo,
        workspace.id,
      );
      if (role === WorkspaceRole.Viewer) {
        throw new ForbiddenException(
          'You do not have write permission for this project',
        );
      }
      return;
    }

    // Personal workspace: unchanged legacy visibility/user_projects logic.
    if (userId === projectInfo.ownerId) {
      return;
    }

    const userProject = await this.getUserProjectPermission(userId, projectId);

    if (userProject) {
      if (userProject.permission === UserProjectPermission.Editor) {
        return;
      }
      throw new ForbiddenException(
        'You do not have write permission for this project',
      );
    }

    if (projectInfo.visibility === ProjectVisibility.AnyoneCanEdit) {
      return;
    }

    throw new ForbiddenException(
      'You do not have write permission for this project',
    );
  }

  async getProjectPermissions(userId: string, projectId: string) {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: ['workspace'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Team workspace: derive permission from workspace role + Group, the
    // same rule `checkViewPermission`/`checkWritePermission` enforce — do
    // NOT fall through to the legacy visibility/user_projects logic below,
    // which knows nothing about WorkspaceRole.Viewer and would silently
    // grant edit access to a Viewer via stale/legacy data.
    if (project.workspace.type === WorkspaceType.Team) {
      if (!userId) return null;
      let role: WorkspaceRole;
      try {
        role = await this.assertTeamProjectAccess(
          userId,
          project,
          project.workspaceId,
        );
      } catch {
        return null;
      }
      const canManage =
        project.ownerId === userId ||
        role === WorkspaceRole.Owner ||
        role === WorkspaceRole.Admin;
      const permission =
        project.ownerId === userId
          ? 'owner'
          : role === WorkspaceRole.Viewer
            ? UserProjectPermission.Viewer
            : UserProjectPermission.Editor;
      return { permission, canManage };
    }

    // Personal workspace: unchanged legacy visibility/user_projects logic.
    const canManage = Boolean(
      userId &&
        (project.ownerId === userId ||
          (await this.workspacesService.isOwnerOrAdmin(
            userId,
            project.workspaceId,
          ))),
    );

    // Check if the user is the owner first
    if (userId && userId === project.ownerId) {
      return { permission: 'owner', canManage };
    }

    if (userId) {
      const userProject = await this.userProjectsRepository.findOne({
        where: { userId: userId, projectId: projectId },
      });

      if (userProject) {
        return { permission: userProject.permission, canManage };
      }

      // Check if user has a pending invitation
      const user = await this.usersService.findById(userId);

      if (user) {
        const invitation = await this.projectInvitationsRepository.findOne({
          where: {
            email: user.email,
            projectId: projectId,
            status: InviteStatus.Pending,
          },
        });

        if (invitation) {
          return {
            permission: 'invited',
            invitationId: invitation.id,
            invitePermission: invitation.permission,
            canManage,
          };
        }
      }
    }

    // Check public visibility
    if (project.visibility === ProjectVisibility.AnyoneCanView) {
      return { permission: UserProjectPermission.Viewer, canManage };
    }

    if (project.visibility === ProjectVisibility.AnyoneCanEdit) {
      return { permission: UserProjectPermission.Editor, canManage };
    }

    return null;
  }

  async getAllProjectPermissions(userId: string, projectId: string) {
    await this.checkViewPermission(userId, projectId);

    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: ['owner', 'workspace', 'group'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
    // Auto-add user to members if accessing public project
    if (userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    // Get all members with user info
    const userProjects = await this.userProjectsRepository.find({
      where: { projectId },
      relations: ['user'],
    });

    // Get all invitations with invited user info
    const invitations = await this.projectInvitationsRepository.find({
      where: { projectId },
      relations: ['invitedUser'],
    });

    const listUsers: Array<{
      userId: string;
      fullName: string;
      email: string;
      avatar: string;
      permission: string;
      isVerified: boolean;
      invitePermission: string | null;
      inviteStatus: string | null;
      invitationId: string | null;
    }> = [];

    // Add owner first
    listUsers.push({
      userId: project.owner.id,
      fullName: project.owner.fullName,
      email: project.owner.email,
      avatar: resolveAvatarUrl(project.owner, this.s3Service),
      permission: 'owner',
      isVerified: true,
      invitePermission: null,
      inviteStatus: null,
      invitationId: null,
    });

    // Add members (excluding owner to avoid duplicates)
    for (const up of userProjects) {
      if (up.userId === project.ownerId) continue;
      listUsers.push({
        userId: up.user.id,
        fullName: up.user.fullName,
        email: up.user.email,
        avatar: resolveAvatarUrl(up.user, this.s3Service),
        permission: up.permission,
        isVerified: true,
        invitePermission: null,
        inviteStatus: null,
        invitationId: null,
      });
    }

    // Add invited users (pending/rejected, not yet accepted members)
    const memberUserIds = new Set(userProjects.map((up) => up.userId));
    for (const inv of invitations) {
      if (inv.invitedUserId && memberUserIds.has(inv.invitedUserId)) continue;
      listUsers.push({
        userId: inv.invitedUserId || inv.id,
        fullName: inv.invitedUser?.fullName || inv.email,
        email: inv.email,
        avatar: resolveAvatarUrl(
          inv.invitedUser ?? { avatarKey: null, email: inv.email },
          this.s3Service,
        ),
        permission: 'invited',
        isVerified: false,
        invitePermission: inv.permission,
        inviteStatus: inv.status,
        invitationId: inv.id,
      });
    }

    return {
      project_mode: project.visibility,
      workspace_id: project.workspaceId,
      workspace_type: project.workspace.type,
      group_id: project.groupId,
      group_name: project.group?.name ?? null,
      list_users: listUsers,
    };
  }

  async getAllSchemas(userId: string, projectId: string) {
    await this.checkViewPermission(userId, projectId);

    // Auto-add user to members if accessing public project
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (project && userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    const schemas = await this.schemasRepository.find({
      where: { projectId: projectId },
      order: { createdAt: 'DESC' },
    });

    const items = schemas.map((schema) => ({
      id: schema.id,
      projectId: schema.projectId,
      name: schema.name,
      type: schema.type,
      dbms: schema.dbms,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt,
    }));

    return items;
  }

  async createSchema(userId: string, projectId: string, dto: CreateSchemaDto) {
    await this.checkWritePermission(userId, projectId);

    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
    await this.subscriptionsService.assertSchemaQuota(
      project.workspaceId,
      projectId,
    );

    // Auto-add user to members if accessing public project
    if (userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    const schema = await this.schemasRepository.save({
      projectId: projectId,
      name: dto.name,
      type: dto.type,
      dbms: dto.type === SchemaType.Physical ? (dto.dbms ?? null) : null,
    });

    await this.initializeSchemaTemplates(
      schema.projectId,
      schema.id,
      schema.name,
      schema.type,
      schema.dbms ?? undefined,
    );

    return {
      id: schema.id,
      projectId: schema.projectId,
      name: schema.name,
      type: schema.type,
      dbms: schema.dbms,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt,
    };
  }

  async getSchema(userId: string, projectId: string, schemaId: string) {
    await this.checkViewPermission(userId, projectId);

    // Auto-add user to members if accessing public project
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (project && userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    const schema = await this.schemasRepository.findOne({
      where: { id: schemaId, projectId: projectId },
    });

    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    return {
      id: schema.id,
      projectId: schema.projectId,
      name: schema.name,
      type: schema.type,
      dbms: schema.dbms,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt,
    };
  }

  async deleteSchema(userId: string, projectId: string, schemaId: string) {
    await this.checkWritePermission(userId, projectId);

    // Auto-add user to members if accessing public project
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (project && userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    const schema = await this.schemasRepository.findOne({
      where: { id: schemaId, projectId: projectId },
    });

    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    await this.schemasRepository.delete({ id: schemaId });

    const currentVersionPrefix = `projects/${projectId}/schemas/${schemaId}/latest`;
    const diagramS3Key = `${currentVersionPrefix}/diagram.schema.json`;
    const modelS3Key = `${currentVersionPrefix}/model.schema.json`;

    await Promise.allSettled([
      this.s3Service.deleteFile(diagramS3Key),
      this.s3Service.deleteFile(modelS3Key),
    ]);

    logger.log(`Deleted schema files in S3 at ${currentVersionPrefix}`);

    return { message: 'Schema deleted successfully' };
  }

  async renameSchema(
    userId: string,
    projectId: string,
    schemaId: string,
    newName: string,
    dbms?: string,
  ) {
    await this.checkWritePermission(userId, projectId);

    // Auto-add user to members if accessing public project
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (project && userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    const schema = await this.schemasRepository.findOne({
      where: { id: schemaId, projectId: projectId },
    });

    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    schema.name = newName;
    if (dbms !== undefined) {
      schema.dbms = dbms;
    }
    await this.schemasRepository.save(schema);

    return {
      id: schema.id,
      projectId: schema.projectId,
      name: schema.name,
      type: schema.type,
      dbms: schema.dbms,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt,
    };
  }

  /**
   * A project can be managed (visibility, collaborators) by whoever created
   * it, or — for Team workspace projects — by the workspace's Owner/Admin,
   * since Team projects belong to the team rather than to one member.
   */
  private async checkOwnership(
    userId: string,
    projectId: string,
  ): Promise<ProjectEntity> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: ['owner', 'workspace'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
    await this.workspacesService.assertResourceWorkspaceAccess(
      userId,
      project.workspaceId,
    );

    if (project.ownerId !== userId) {
      const canManageAsTeamAdmin =
        project.workspace.type === WorkspaceType.Team &&
        (await this.workspacesService.isOwnerOrAdmin(
          userId,
          project.workspaceId,
        ));
      if (!canManageAsTeamAdmin) {
        throw new ForbiddenException(
          'Only the project owner or a workspace admin can perform this action',
        );
      }
    }

    return project;
  }

  async updateProjectVisibility(
    userId: string,
    projectId: string,
    visibility: ProjectVisibility,
  ) {
    const project = await this.checkOwnership(userId, projectId);
    const previousVisibility = project.visibility;

    await this.projectsRepository.update(projectId, {
      visibility,
    });

    await this.workspacesService.logActivity(
      project.workspaceId,
      userId,
      'project.visibility_change',
      'project',
      projectId,
      { visibility: previousVisibility },
      { visibility },
    );

    return { message: 'Project visibility updated successfully' };
  }

  /**
   * Team-workspace equivalent of `updateProjectVisibility`: scope a project
   * to a Group (or clear it, `groupId: null`, to share with the whole team).
   */
  async updateProjectGroup(
    userId: string,
    projectId: string,
    groupId: string | null,
  ) {
    const project = await this.checkOwnership(userId, projectId);
    if (groupId) {
      await this.assertGroupAssignable(userId, project.workspaceId, groupId);
    }
    const previousGroupId = project.groupId;

    await this.projectsRepository.update(projectId, { groupId });

    await this.workspacesService.logActivity(
      project.workspaceId,
      userId,
      'project.group_change',
      'project',
      projectId,
      { groupId: previousGroupId },
      { groupId },
    );

    return { message: 'Project group updated successfully' };
  }

  private async assertGroupAssignable(
    userId: string,
    workspaceId: string,
    groupId: string,
  ) {
    const belongs = await this.groupsService.belongsToWorkspace(
      groupId,
      workspaceId,
    );
    if (!belongs) throw new NotFoundException('Group not found');

    const canSeeAll = await this.workspacesService.isOwnerOrAdmin(
      userId,
      workspaceId,
    );
    if (
      !canSeeAll &&
      !(await this.groupsService.isUserInGroup(userId, groupId))
    ) {
      throw new NotFoundException('Group not found');
    }
  }

  async updateUserPermission(
    userId: string,
    projectId: string,
    targetUserId: string,
    permission: UserProjectPermission,
  ) {
    const project = await this.checkOwnership(userId, projectId);

    if (targetUserId === project.ownerId) {
      throw new ForbiddenException("Cannot change the owner's permission");
    }

    const userProject = await this.userProjectsRepository.findOne({
      where: { userId: targetUserId, projectId },
    });

    if (!userProject) {
      throw new NotFoundException('User is not a member of this project');
    }

    userProject.permission = permission;
    await this.userProjectsRepository.save(userProject);

    return { message: 'User permission updated successfully' };
  }

  async removeUserAccess(userId: string, projectId: string, email: string) {
    const project = await this.checkOwnership(userId, projectId);

    // Decode email in case it's URL encoded
    const decodedEmail = decodeURIComponent(email);

    // Check if trying to remove owner
    if (project.owner.email === decodedEmail) {
      throw new ForbiddenException('Cannot remove the owner from the project');
    }

    // Find user by email (if exists)
    const targetUser = await this.usersService.findByEmail(decodedEmail);

    // Remove from user_projects if user exists and is a member
    if (targetUser) {
      await this.userProjectsRepository.delete({
        userId: targetUser.id,
        projectId,
      });
    }

    // Also remove any pending invitations by email
    await this.projectInvitationsRepository.delete({
      email: decodedEmail,
      projectId,
    });

    return { message: 'User access removed successfully' };
  }

  async inviteUsers(userId: string, projectId: string, dto: InviteUsersDto) {
    const project = await this.checkOwnership(userId, projectId);
    const inviter = await this.usersService.findById(userId);

    if (!inviter) {
      throw new NotFoundException('Inviter user not found');
    }

    const results: Array<{ email: string; status: string }> = [];

    for (const inviteItem of dto.users) {
      const canReceiveAccess =
        await this.workspacesService.canReceiveProjectAccess(
          project.workspaceId,
          inviteItem.email,
        );
      if (!canReceiveAccess) {
        results.push({
          email: inviteItem.email,
          status: 'not_workspace_member',
        });
        continue;
      }
      const targetUser = await this.usersService.findByEmail(inviteItem.email);

      if (targetUser && targetUser.id === project.ownerId) {
        results.push({ email: inviteItem.email, status: 'is_owner' });
        continue;
      }

      if (targetUser) {
        // Check if already a member
        const existingMember = await this.userProjectsRepository.findOne({
          where: { userId: targetUser.id, projectId },
        });

        if (existingMember) {
          results.push({ email: inviteItem.email, status: 'already_member' });
          continue;
        }
      }

      // Check if already invited (pending)
      const existingInvitation =
        await this.projectInvitationsRepository.findOne({
          where: {
            email: inviteItem.email,
            projectId,
            status: InviteStatus.Pending,
          },
        });

      let invitationId: string;

      if (existingInvitation) {
        // Update the permission if different
        existingInvitation.permission = inviteItem.invite_permission;
        if (targetUser && !existingInvitation.invitedUserId) {
          existingInvitation.invitedUserId = targetUser.id;
        }
        const saved =
          await this.projectInvitationsRepository.save(existingInvitation);
        invitationId = saved.id;
        results.push({ email: inviteItem.email, status: 'updated_invitation' });
      } else {
        // Create new invitation
        const saved = await this.projectInvitationsRepository.save({
          projectId,
          email: inviteItem.email,
          invitedUserId: targetUser ? targetUser.id : null,
          inviterUserId: userId,
          permission: inviteItem.invite_permission,
          status: InviteStatus.Pending,
        });
        invitationId = saved.id;
        results.push({ email: inviteItem.email, status: 'invited' });
      }

      // Send email if requested (fire-and-forget for faster response)
      if (dto.sendEmail) {
        this.mailService
          .sendInvitationEmail(
            inviteItem.email,
            inviter.fullName,
            project.name,
            inviteItem.invite_permission,
            invitationId,
            dto.message,
          )
          .catch((error) => {
            logger.error(
              `Failed to send invitation email to ${inviteItem.email}`,
              error,
            );
          });
      }
    }

    return { message: 'Invitations processed', results };
  }

  async acceptInvitation(userId: string, token: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const invitation = await this.projectInvitationsRepository.findOne({
      where: { id: token },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or invalid');
    }

    if (invitation.email !== user.email) {
      throw new ForbiddenException(
        'This invitation is for a different email address',
      );
    }

    if (invitation.status !== InviteStatus.Pending) {
      throw new BadRequestException('This invitation is no longer pending');
    }

    // Check if already a member
    const existingMember = await this.userProjectsRepository.findOne({
      where: { userId: user.id, projectId: invitation.projectId },
    });

    if (existingMember) {
      invitation.status = InviteStatus.Accepted;
      await this.projectInvitationsRepository.save(invitation);
      return {
        message: 'User is already a project member',
        projectId: invitation.projectId,
      };
    }

    // Add user to project
    await this.userProjectsRepository.save({
      userId: user.id,
      projectId: invitation.projectId,
      permission: invitation.permission,
    });

    // Update invitation status
    invitation.status = InviteStatus.Accepted;
    invitation.invitedUserId = user.id;
    await this.projectInvitationsRepository.save(invitation);

    return {
      message: 'Invitation accepted successfully',
      projectId: invitation.projectId,
    };
  }

  /**
   * Save model JSON directly to S3 for a schema.
   * Used by AI chat to persist generated model data before the user opens the editor.
   */
  async saveSchemaModel(
    userId: string,
    projectId: string,
    schemaId: string,
    modelData: Record<string, unknown>,
  ) {
    await this.checkWritePermission(userId, projectId);

    const schema = await this.schemasRepository.findOne({
      where: { id: schemaId, projectId },
    });

    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    const currentVersionPrefix = `projects/${projectId}/schemas/${schemaId}/latest`;
    const modelS3Key = `${currentVersionPrefix}/model.schema.json`;
    const diagramS3Key = `${currentVersionPrefix}/diagram.schema.json`;

    await this.s3Service.putJsonObject(modelS3Key, modelData);

    // Delete the diagram from S3 so the frontend hook regenerates it
    // from the new model (with auto-layout) on next open.
    try {
      await this.s3Service.deleteFile(diagramS3Key);
    } catch {
      // Ignore errors — file may not exist
    }

    // Invalidate the Yjs/Redis cache so the next connection reads the
    // updated model from S3 instead of the stale cached Yjs document.
    const redisKey = `diagram:${projectId}:${schemaId}`;
    try {
      await this.redisClient.del(redisKey);
      logger.log(`Invalidated Redis cache for schema ${schemaId}: ${redisKey}`);
    } catch (e) {
      logger.warn(`Failed to invalidate Redis cache for ${schemaId}:`, e);
    }

    logger.log(`Saved model for schema ${schemaId} to S3: ${modelS3Key}`);

    return { message: 'Model saved successfully' };
  }

  // ── Schema Versioning ────────────────────────────────────────────

  /**
   * Public accessor for the freshest live model.json of a schema (Redis/Yjs
   * first, S3 fallback) — used by the sandbox module to provision/sync a
   * schema's sandbox against whatever the user is currently editing.
   */
  async getCurrentSchemaModel(
    projectId: string,
    schemaId: string,
  ): Promise<Record<string, unknown> | null> {
    const { model } = await this.getLatestSchemaDataFromRedis(
      projectId,
      schemaId,
    );
    return model;
  }

  /**
   * Read the latest model + diagram data from Redis (Yjs doc, freshest)
   * with S3 fallback.
   */
  private async getLatestSchemaDataFromRedis(
    projectId: string,
    schemaId: string,
  ): Promise<{
    model: Record<string, unknown> | null;
    diagram: Record<string, unknown> | null;
  }> {
    const redisKey = `diagram:${projectId}:${schemaId}`;
    const cached = await this.redisClient.get(redisKey);

    if (cached) {
      logger.log(`getLatestSchemaData: reading from Redis: ${redisKey}`);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, Buffer.from(cached, 'base64'));

      const modelStr = ydoc.getMap('model').get('data') as string | undefined;
      const diagramStr = ydoc.getMap('diagram').get('data') as
        | string
        | undefined;

      let model: Record<string, unknown> | null = null;
      let diagram: Record<string, unknown> | null = null;

      try {
        if (modelStr) model = JSON.parse(modelStr) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      try {
        if (diagramStr)
          diagram = JSON.parse(diagramStr) as Record<string, unknown>;
      } catch {
        /* ignore */
      }

      ydoc.destroy();
      return { model, diagram };
    }

    // Fallback to S3
    logger.log(
      `getLatestSchemaData: Redis miss, falling back to S3 for ${schemaId}`,
    );
    const prefix = `projects/${projectId}/schemas/${schemaId}/latest`;
    const [model, diagram] = await Promise.all([
      this.s3Service.getJsonObject<Record<string, unknown>>(
        `${prefix}/model.schema.json`,
      ),
      this.s3Service.getJsonObject<Record<string, unknown>>(
        `${prefix}/diagram.schema.json`,
      ),
    ]);

    return { model: model ?? null, diagram: diagram ?? null };
  }

  /**
   * Create a new version snapshot of the current schema.
   * Reads the freshest data from Redis (Yjs doc) with S3 fallback.
   * No client data needed.
   */
  async createSchemaVersion(
    userId: string,
    projectId: string,
    schemaId: string,
    label?: string,
  ) {
    await this.checkWritePermission(userId, projectId);

    const schema = await this.schemasRepository.findOne({
      where: { id: schemaId, projectId },
    });
    if (!schema) {
      throw new NotFoundException('Schema not found');
    }
    await this.subscriptionsService.assertSchemaVersionQuota(
      projectId,
      schemaId,
    );

    // Read freshest data from Redis (Yjs doc) with S3 fallback
    const { model: modelData, diagram: diagramData } =
      await this.getLatestSchemaDataFromRedis(projectId, schemaId);

    if (!modelData) {
      throw new BadRequestException(
        'No model data found for this schema. Save your diagram first.',
      );
    }

    // Determine next version number
    const latestVersion = await this.schemaVersionsRepository.findOne({
      where: { schemaId },
      order: { version: 'DESC' },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    // Save model snapshot to S3
    const versionS3Key = `projects/${projectId}/schemas/${schemaId}/v${nextVersion}/model.schema.json`;
    await this.s3Service.putJsonObject(versionS3Key, modelData);

    // Save diagram snapshot to S3
    let diagramS3Key: string | null = null;
    if (diagramData) {
      diagramS3Key = `projects/${projectId}/schemas/${schemaId}/v${nextVersion}/diagram.schema.json`;
      await this.s3Service.putJsonObject(diagramS3Key, diagramData);
    }

    // Create version record
    const versionEntity = await this.schemaVersionsRepository.save({
      schemaId,
      version: nextVersion,
      label: label || `Version ${nextVersion}`,
      s3Key: versionS3Key,
      createdBy: userId,
    });

    logger.log(
      `Created version ${nextVersion} for schema ${schemaId}: ${versionS3Key}`,
    );

    return {
      id: versionEntity.id,
      version: versionEntity.version,
      label: versionEntity.label,
      createdAt: versionEntity.createdAt,
    };
  }

  /**
   * List all versions for a schema, ordered by version desc.
   */
  async getSchemaVersions(userId: string, projectId: string, schemaId: string) {
    await this.checkViewPermission(userId, projectId);

    const schema = await this.schemasRepository.findOne({
      where: { id: schemaId, projectId },
    });
    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    const versions = await this.schemaVersionsRepository.find({
      where: { schemaId },
      order: { version: 'DESC' },
      select: ['id', 'version', 'label', 'createdBy', 'createdAt'],
    });

    return versions;
  }

  /**
   * Get the model data for a specific version.
   */
  async getSchemaVersionData(
    userId: string,
    projectId: string,
    schemaId: string,
    versionId: string,
  ) {
    await this.checkViewPermission(userId, projectId);

    const version = await this.schemaVersionsRepository.findOne({
      where: { id: versionId, schemaId },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }

    const modelData = await this.s3Service.getJsonObject<
      Record<string, unknown>
    >(version.s3Key);
    if (!modelData) {
      throw new NotFoundException('Version data not found in storage');
    }

    // Try to load diagram snapshot (may not exist for older versions)
    const diagramS3Key = version.s3Key.replace(
      'model.schema.json',
      'diagram.schema.json',
    );
    const diagramData = await this.s3Service
      .getJsonObject<Record<string, unknown>>(diagramS3Key)
      .catch(() => null);

    return {
      id: version.id,
      version: version.version,
      label: version.label,
      createdAt: version.createdAt,
      model: modelData,
      diagram: diagramData ?? null,
    };
  }

  // ── Shared HTML docs ───────────────────────────────────────────

  async shareHtmlDocs(html: string): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    const key = `shared-docs/${id}.json`;
    await this.s3Service.putJsonObject(key, { html });
    return { id };
  }

  async getSharedHtmlDocs(id: string): Promise<string> {
    const key = `shared-docs/${id}.json`;
    const data = await this.s3Service.getJsonObject<{ html: string }>(key);
    if (!data?.html) {
      throw new NotFoundException('Shared document not found');
    }
    return data.html;
  }
}
