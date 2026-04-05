import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/createProject.dto';
import { GetProjectDto } from './dto/getProject.dto';
import { CreateSchemaDto } from './dto/createSchema.dto';
import { InviteUsersDto } from './dto/inviteUsers.dto';
import { Repository } from 'typeorm';
import { ProjectEntity } from './entity/project.entity';
import { SchemaEntity } from './entity/schema.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserProjectEntity } from './entity/user-project.entity';
import { ProjectInvitationEntity } from './entity/project-invitation.entity';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';
import { InviteStatus } from '@/common/enums/invite-status.enum';
import { S3Service } from '../s3/s3.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { SchemaType } from '@/common/enums/schema-type.enum';
import { ProjectVisibility } from '@/common/enums/project-visibility.enum';

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
    private readonly s3Service: S3Service,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async createProject(userId: string, dto: CreateProjectDto) {
    const project = await this.projectsRepository.save({
      ownerId: userId,
      name: dto.name,
    });

    await this.userProjectsRepository.save({
      userId: userId,
      projectId: project.id,
      permission: UserProjectPermission.Editor,
    });

    await this.createSchema(userId, project.id, {
      name: 'Untitled Diagram',
      type: SchemaType.Conceptual,
    });

    const projectWithOwner = await this.projectsRepository.findOne({
      where: { id: project.id },
      relations: ['owner'],
    });

    if (!projectWithOwner) {
      throw new NotFoundException('Project not found');
    }

    return this.formatProjectResponse(projectWithOwner);
  }

  async getAllProjects(userId: string, query?: GetProjectDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 9;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userProjectsRepository
      .createQueryBuilder('userProject')
      .leftJoinAndSelect('userProject.project', 'project')
      .leftJoinAndSelect('project.owner', 'owner')
      .where('userProject.userId = :userId', { userId });

    if (query?.keyword) {
      queryBuilder.andWhere('project.name ILIKE :keyword', {
        keyword: `%${query.keyword}%`,
      });
    }

    const total = await queryBuilder.getCount();

    const userProjects = await queryBuilder
      .orderBy('project.updatedAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const items = userProjects.map((userProject) =>
      this.formatProjectResponse(userProject.project),
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
    const emailHash = this.generateEmailHash(owner.email);
    const avatar = `https://www.gravatar.com/avatar/${emailHash}?s=200&d=identicon&r=g`;

    return {
      id: project.id,
      name: project.name,
      owner: {
        id: owner.id,
        name: owner.fullName,
        email: owner.email,
        avatar: avatar,
      },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      status: 'active',
    };
  }

  private generateEmailHash(email: string): string {
    return crypto
      .createHash('md5')
      .update(email.toLowerCase().trim())
      .digest('hex');
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

  private async initializeSchemaTemplates(
    projectId: string,
    schemaId: string,
    schemaName: string,
  ) {
    const diagramTemplate = {
      diagram: {
        id: `cid_diagram_${schemaId}`,
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

    const modelTemplate = {
      model: {
        id: `cid_model_${schemaId}`,
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

  async checkViewPermission(userId: string, projectId: string): Promise<void> {
    const projectInfo = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!projectInfo) {
      throw new NotFoundException('Project not found');
    }

    // Allow public projects
    if (
      projectInfo.visibility === ProjectVisibility.AnyoneCanView ||
      projectInfo.visibility === ProjectVisibility.AnyoneCanEdit
    ) {
      return;
    }

    // For private projects (OwnerAndInvited)
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

    // Check if user is owner
    if (userId === projectInfo.ownerId) {
      return;
    }

    // Check user's explicit permission in user_projects table
    const userProject = await this.getUserProjectPermission(userId, projectId);

    if (userProject) {
      // User has explicit permission - must be Editor or owner
      if (userProject.permission === UserProjectPermission.Editor) {
        return;
      }
      // User is Viewer or other - no write permission
      throw new ForbiddenException(
        'You do not have write permission for this project',
      );
    }

    // No explicit permission - check project visibility
    if (projectInfo.visibility === ProjectVisibility.AnyoneCanEdit) {
      return;
    }

    // Project is private or view-only
    throw new ForbiddenException(
      'You do not have write permission for this project',
    );
  }

  async getProjectPermissions(userId: string, projectId: string) {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if the user is the owner first
    if (userId && userId === project.ownerId) {
      return { permission: 'owner' };
    }

    if (userId) {
      const userProject = await this.userProjectsRepository.findOne({
        where: { userId: userId, projectId: projectId },
      });

      if (userProject) {
        return { permission: userProject.permission };
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
          };
        }
      }
    }

    // Check public visibility
    if (project.visibility === ProjectVisibility.AnyoneCanView) {
      return { permission: UserProjectPermission.Viewer };
    }

    if (project.visibility === ProjectVisibility.AnyoneCanEdit) {
      return { permission: UserProjectPermission.Editor };
    }

    return null;
  }

  async getAllProjectPermissions(userId: string, projectId: string) {
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
    const ownerEmailHash = this.generateEmailHash(project.owner.email);
    const ownerAvatar = `https://www.gravatar.com/avatar/${ownerEmailHash}?s=200&d=identicon&r=g`;
    listUsers.push({
      userId: project.owner.id,
      fullName: project.owner.fullName,
      email: project.owner.email,
      avatar: ownerAvatar,
      permission: 'owner',
      isVerified: true,
      invitePermission: null,
      inviteStatus: null,
      invitationId: null,
    });

    // Add members (excluding owner to avoid duplicates)
    for (const up of userProjects) {
      if (up.userId === project.ownerId) continue;
      const emailHash = this.generateEmailHash(up.user.email);
      const avatar = `https://www.gravatar.com/avatar/${emailHash}?s=200&d=identicon&r=g`;
      listUsers.push({
        userId: up.user.id,
        fullName: up.user.fullName,
        email: up.user.email,
        avatar,
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
      const emailHash = this.generateEmailHash(inv.email);
      const avatar = `https://www.gravatar.com/avatar/${emailHash}?s=200&d=identicon&r=g`;
      listUsers.push({
        userId: inv.invitedUserId || inv.id,
        fullName: inv.invitedUser?.fullName || inv.email,
        email: inv.email,
        avatar,
        permission: 'invited',
        isVerified: false,
        invitePermission: inv.permission,
        inviteStatus: inv.status,
        invitationId: inv.id,
      });
    }

    return {
      project_mode: project.visibility,
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

    // Auto-add user to members if accessing public project
    if (userId && userId !== project.ownerId) {
      await this.ensureUserMembership(userId, projectId, project.visibility);
    }

    const schema = await this.schemasRepository.save({
      projectId: projectId,
      name: dto.name,
      type: dto.type,
    });

    await this.initializeSchemaTemplates(
      schema.projectId,
      schema.id,
      schema.name,
    );

    return {
      id: schema.id,
      projectId: schema.projectId,
      name: schema.name,
      type: schema.type,
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
    await this.schemasRepository.save(schema);

    return {
      id: schema.id,
      projectId: schema.projectId,
      name: schema.name,
      type: schema.type,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt,
    };
  }

  private async checkOwnership(
    userId: string,
    projectId: string,
  ): Promise<ProjectEntity> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      relations: ['owner'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner can perform this action',
      );
    }

    return project;
  }

  async updateProjectVisibility(
    userId: string,
    projectId: string,
    visibility: ProjectVisibility,
  ) {
    await this.checkOwnership(userId, projectId);

    await this.projectsRepository.update(projectId, {
      visibility,
    });

    return { message: 'Project visibility updated successfully' };
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
}
