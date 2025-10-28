import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums/role.enum';
import { RolesGuard } from '@/common/guards/roles.guard';

@ApiTags('admin/projects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@ApiCookieAuth()
@Controller()
export class AdminProjectsController {
  @ApiOperation({ summary: 'List projects (admin)' })
  @ApiOkResponse({ description: 'Projects listed' })
  @Get('')
  list() {
    return { items: [] };
  }
}
