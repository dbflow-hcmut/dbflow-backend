import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/createProject.dto';
import { GetProjectDto } from './dto/getProject.dto';
import { CreateSchemaDto } from './dto/createSchema.dto';
import { Repository } from 'typeorm';
import { ProjectEntity } from './entity/project.entity';
import { SchemaEntity } from './entity/schema.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserProjectEntity } from './entity/user-project.entity';
import { ProjectInvitationEntity } from './entity/project-invitation.entity';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';
import { S3Service } from '../s3/s3.service';
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

    return this.formatProjectResponse(project);
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
    } else {
      if (
        projectInfo.visibility === ProjectVisibility.AnyoneCanView ||
        projectInfo.visibility === ProjectVisibility.AnyoneCanEdit
      ) {
        return;
      }

      throw new ForbiddenException(
        'User does not have permission to access this project',
      );
    }
  }

  async checkWritePermission(userId: string, projectId: string): Promise<void> {
    const projectInfo = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!projectInfo) {
      throw new NotFoundException('Project not found');
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

      if (userProject.permission !== UserProjectPermission.Editor) {
        throw new ForbiddenException(
          'User does not have permission to access this project',
        );
      }
    } else {
      if (projectInfo.visibility === ProjectVisibility.AnyoneCanEdit) {
        return;
      }

      throw new ForbiddenException(
        'User does not have permission to access this project',
      );
    }
  }

  async getProjectPermissions(userId: string, projectId: string) {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (userId) {
      const userProject = await this.userProjectsRepository.findOne({
        where: { userId: userId, projectId: projectId },
      });

      return userProject?.permission;
    }

    if (project.visibility === ProjectVisibility.AnyoneCanView) {
      return UserProjectPermission.Viewer;
    }

    if (project.visibility === ProjectVisibility.AnyoneCanEdit) {
      return UserProjectPermission.Editor;
    }

    return null;
  }

  async getAllSchemas(userId: string, projectId: string) {
    await this.checkViewPermission(userId, projectId);

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
}
