import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '@/common/types/request.type';
import { CreateProjectDto } from './dto/createProject.dto';
import { GetProjectDto } from './dto/getProject.dto';
import { CreateSchemaDto } from './dto/createSchema.dto';
import { ProjectsService } from './projects.service';
import {
  CreateProjectSuccessResponseDto,
  GetAllProjectsSuccessResponseDto,
  GetProjectSuccessResponseDto,
  AllProjectPermissionsResponseDto,
} from './dto/project-response.dto';
import {
  CreateSchemaSuccessResponseDto,
  GetAllSchemasSuccessResponseDto,
} from './dto/schema-response.dto';
import {
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  InternalServerErrorResponseDto,
} from '@/common/dto/error-response.dto';
import { UpdateSchemaDto } from './dto/updateSchema.dto';
import { UpdateProjectVisibilityDto } from './dto/updateProjectVisibility.dto';
import { UpdateUserPermissionDto } from './dto/updateUserPermission.dto';
import { InviteUsersDto } from './dto/inviteUsers.dto';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Create a new project',
    description: 'Create a new project',
  })
  @ApiBody({ type: CreateProjectDto })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
    type: CreateProjectSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation error',
    type: BadRequestResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async createProject(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateProjectDto,
  ) {
    try {
      const userId = req.user.id;
      const project = await this.projectsService.createProject(userId, dto);
      return project;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get('')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get all projects',
    description: 'Get all projects with optional keyword search',
  })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Search keyword for project name',
  })
  @ApiOkResponse({
    description: 'Projects retrieved successfully',
    type: GetAllProjectsSuccessResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async getAllProjects(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetProjectDto,
  ) {
    try {
      const userId = req.user.id;
      const projects = await this.projectsService.getAllProjects(userId, query);
      return projects;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get(':projectId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get project information',
    description: 'Get project information',
  })
  @ApiOkResponse({
    description: 'Project information retrieved successfully',
    type: GetProjectSuccessResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have access to this project',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async getProjectInformation(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    try {
      const userId = req.user.id;
      const project = await this.projectsService.getProjectInformation(
        userId,
        projectId,
      );
      return project;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Delete(':projectId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Delete a project or leave a project',
    description:
      'If the user is the project owner, the entire project will be deleted. If the user is a member, they will be removed from the project.',
  })
  @ApiResponse({
    status: 200,
    description: 'Project deleted successfully or user left the project',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project not found or user is not a member',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async deleteProject(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    try {
      const userId = req.user.id;
      const result = await this.projectsService.deleteProject(
        userId,
        projectId,
      );
      return result;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get(':projectId/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get all project permissions',
    description:
      'Get all users, their permissions, and pending invitations for a project',
  })
  @ApiOkResponse({
    description: 'All project permissions retrieved successfully',
    type: AllProjectPermissionsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have access to this project',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async getAllProjectPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    try {
      const userId = req.user.id;
      const permissions = await this.projectsService.getAllProjectPermissions(
        userId,
        projectId,
      );
      return permissions;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get(':projectId/me/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get project permissions',
    description: 'Get project permissions',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have access to this project',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async getProjectPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    try {
      const userId = req.user.id;
      const permissions = await this.projectsService.getProjectPermissions(
        userId || '',
        projectId,
      );
      return permissions;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Patch(':projectId/visibility')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Update project visibility',
    description:
      'Change the project visibility mode. Only the project owner can perform this action.',
  })
  @ApiBody({ type: UpdateProjectVisibilityDto })
  @ApiResponse({ status: 200, description: 'Visibility updated successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not the project owner',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async updateProjectVisibility(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectVisibilityDto,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.updateProjectVisibility(
        userId,
        projectId,
        dto.projectMode,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Patch(':projectId/permissions/:targetUserId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: "Update a user's permission",
    description:
      "Change a user's permission in the project. Only the project owner can perform this action.",
  })
  @ApiBody({ type: UpdateUserPermissionDto })
  @ApiResponse({
    status: 200,
    description: 'User permission updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async updateUserPermission(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: UpdateUserPermissionDto,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.updateUserPermission(
        userId,
        projectId,
        targetUserId,
        dto.permission,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Delete(':projectId/permissions/:email')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: "Remove a user's access",
    description:
      'Remove a user from the project by email. Only the project owner can perform this action. Works for both registered users and pending invitations.',
  })
  @ApiResponse({ status: 200, description: 'User access removed successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async removeUserAccess(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('email') email: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.removeUserAccess(
        userId,
        projectId,
        email,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Post(':projectId/invitations')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Invite users to the project',
    description:
      'Invite users by email to the project. Optionally sends invitation emails via Gmail. Only the project owner can perform this action.',
  })
  @ApiBody({ type: InviteUsersDto })
  @ApiResponse({ status: 201, description: 'Invitations sent successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async inviteUsers(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: InviteUsersDto,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.inviteUsers(userId, projectId, dto);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Post(':projectId/schemas')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Create a new schema for a project',
    description: 'Create a new schema for a project with template files',
  })
  @ApiBody({ type: CreateSchemaDto })
  @ApiResponse({
    status: 201,
    description: 'Schema created successfully',
    type: CreateSchemaSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation error',
    type: BadRequestResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to create schemas',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async createSchema(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateSchemaDto,
  ) {
    try {
      const userId = req.user.id;
      const schema = await this.projectsService.createSchema(
        userId,
        projectId,
        dto,
      );
      return schema;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get(':projectId/schemas')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get all schemas for a project',
    description: 'Get all schemas for a project',
  })
  @ApiOkResponse({
    description: 'Schemas retrieved successfully',
    type: GetAllSchemasSuccessResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have access to this project',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async getAllSchemas(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    try {
      const userId = req.user.id;
      const schemas = await this.projectsService.getAllSchemas(
        userId,
        projectId,
      );
      return schemas;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get(':projectId/schemas/:schemaId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get a schema from a project',
    description: 'Get a schema from a project',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to get schemas',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Schema not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async getSchema(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
  ) {
    try {
      const userId = req.user.id;
      const schema = await this.projectsService.getSchema(
        userId,
        projectId,
        schemaId,
      );
      return schema;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Delete(':projectId/schemas/:schemaId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Delete a schema from a project',
    description: 'Delete a schema from a project',
  })
  @ApiResponse({
    status: 200,
    description: 'Schema deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to delete schemas',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project or Schema not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async deleteSchema(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
  ) {
    try {
      const userId = req.user.id;
      const result = await this.projectsService.deleteSchema(
        userId,
        projectId,
        schemaId,
      );
      return result;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Patch(':projectId/schemas/:schemaId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Update a schema in a project',
    description: 'Update a schema in a project',
  })
  @ApiResponse({
    status: 200,
    description: 'Schema updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have permission to update schemas',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Project or Schema not found',
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: InternalServerErrorResponseDto,
  })
  async updateSchema(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
    @Body() dto: UpdateSchemaDto,
  ) {
    try {
      const userId = req.user.id;
      const result = await this.projectsService.renameSchema(
        userId,
        projectId,
        schemaId,
        dto.name,
      );
      return result;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Put(':projectId/schemas/:schemaId/model')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Save model data for a schema',
    description:
      'Directly save model JSON to S3 storage for a schema. Used by AI chat to persist generated model data.',
  })
  @ApiResponse({ status: 200, description: 'Model saved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async saveSchemaModel(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
    @Body(
      new ValidationPipe({
        transform: false,
        whitelist: false,
        forbidNonWhitelisted: false,
      }),
    )
    modelData: Record<string, unknown>,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.saveSchemaModel(
        userId,
        projectId,
        schemaId,
        modelData,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Post('invitations/accept')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Accept a project invitation',
    description: 'Accept a project invitation using a token',
  })
  @ApiBody({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  @ApiResponse({ status: 200, description: 'Invitation accepted' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async acceptInvitation(
    @Req() req: AuthenticatedRequest,
    @Body('token') token: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.acceptInvitation(userId, token);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  // ── Schema Versioning Endpoints ──────────────────────────────────

  @Post(':projectId/schemas/:schemaId/versions')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Create a new version snapshot',
    description: 'Snapshot the current schema model as a new version.',
  })
  @ApiResponse({ status: 201, description: 'Version created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async createSchemaVersion(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
    @Body('label') label?: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.createSchemaVersion(
        userId,
        projectId,
        schemaId,
        label,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get(':projectId/schemas/:schemaId/versions')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'List all versions of a schema',
    description: 'Returns version history ordered by version desc.',
  })
  @ApiResponse({ status: 200, description: 'Version list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async getSchemaVersions(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.getSchemaVersions(
        userId,
        projectId,
        schemaId,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  @Get(':projectId/schemas/:schemaId/versions/:versionId')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get a specific version with its model data',
    description: 'Returns the model JSON for a specific version.',
  })
  @ApiResponse({ status: 200, description: 'Version data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async getSchemaVersionData(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('schemaId') schemaId: string,
    @Param('versionId') versionId: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.projectsService.getSchemaVersionData(
        userId,
        projectId,
        schemaId,
        versionId,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error)
        throw new InternalServerErrorException(error.message);
      throw new InternalServerErrorException('Internal server error');
    }
  }
}
