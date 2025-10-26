import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums/role.enum';
import { RolesGuard } from '@/common/guards/roles.guard';

@ApiTags('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@ApiBearerAuth('JWT-auth')
@Controller()
export class AdminUsersController {
  @ApiOperation({ summary: 'List users (admin)' })
  @ApiOkResponse({ description: 'Users listed' })
  @Get('')
  list() {
    return { items: [] };
  }
}
