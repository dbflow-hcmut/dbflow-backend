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

@ApiTags('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@ApiBearerAuth('JWT-auth')
@Controller()
export class AdminOrdersController {
  @ApiOperation({ summary: 'List orders (admin)' })
  @ApiOkResponse({ description: 'Orders listed' })
  @Get('')
  list() {
    return { items: [] };
  }
}
