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
import { FOLDER_STORAGE_PROJECT } from '@/common/constants';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import * as crypto from 'crypto';

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

    const projectFolder = path.join(FOLDER_STORAGE_PROJECT, project.id);
    await fsExtra.mkdir(projectFolder, { recursive: true });

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

    const userProject = await this.userProjectsRepository.findOne({
      where: { userId: userId, projectId: projectId },
      relations: ['project', 'project.owner'],
    });

    if (!userProject) {
      throw new NotFoundException(
        'User does not have permission to view this project',
      );
    }

    return this.formatProjectResponse(userProject.project);
  }

  private async initializeSchemaTemplates(
    schemaFolder: string,
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

    const diagramPath = path.join(schemaFolder, 'diagram.schema.json');
    const modelPath = path.join(schemaFolder, 'model.schema.json');

    await fsExtra.writeJSON(diagramPath, diagramTemplate, { spaces: 2 });
    await fsExtra.writeJSON(modelPath, modelTemplate, { spaces: 2 });

    logger.log(
      `Initialized schema templates for schema ${schemaId} in ${schemaFolder}`,
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
    const userProject = await this.getUserProjectPermission(userId, projectId);

    logger.log('userProject', userProject);

    if (!userProject) {
      throw new NotFoundException(
        'User does not have permission to access this project',
      );
    }

    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async checkWritePermission(userId: string, projectId: string): Promise<void> {
    const userProject = await this.getUserProjectPermission(userId, projectId);

    if (!userProject) {
      throw new NotFoundException(
        'User does not have permission to access this project',
      );
    }

    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (userProject.permission !== UserProjectPermission.Editor) {
      throw new ForbiddenException('Only editors can perform this action');
    }
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

    const schemaFolder = path.join(
      FOLDER_STORAGE_PROJECT,
      projectId,
      schema.id,
    );
    await fsExtra.mkdir(schemaFolder, { recursive: true });

    await this.initializeSchemaTemplates(schemaFolder, schema.id, schema.name);

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
