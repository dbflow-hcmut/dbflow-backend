import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards
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
import { CreateProjectSuccessResponseDto, GetAllProjectsSuccessResponseDto, GetProjectSuccessResponseDto } from './dto/project-response.dto';
import { CreateSchemaSuccessResponseDto, GetAllSchemasSuccessResponseDto } from './dto/schema-response.dto';
import {
  BadRequestResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  InternalServerErrorResponseDto,
} from '@/common/dto/error-response.dto';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService
  ) { }

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
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  @Get('')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get all projects',
    description: 'Get all projects with optional keyword search',
  })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: 'Search keyword for project name' })
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
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
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
  async getProjectInformation(@Req() req: AuthenticatedRequest, @Param('projectId') projectId: string) {
    try {
      const userId = req.user.id;
      const project = await this.projectsService.getProjectInformation(userId, projectId);
      return project;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
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
      const schema = await this.projectsService.createSchema(userId, projectId, dto);
      return {
        meta: {
          statusCode: 201,
          message: 'success',
        },
        data: schema,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
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
  async getAllSchemas(@Req() req: AuthenticatedRequest, @Param('projectId') projectId: string) {
    try {
      const userId = req.user.id;
      const schemas = await this.projectsService.getAllSchemas(userId, projectId);
      return schemas;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
    }
  }
}
