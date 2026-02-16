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
  Query,
  Req,
  UseGuards,
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
      return {
        meta: {
          statusCode: 201,
          message: 'success',
        },
        data: schema,
      };
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
}
