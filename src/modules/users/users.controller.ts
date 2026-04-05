import { Controller, Get, Put, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get user profile' })
  @ApiOkResponse({
    schema: {
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        fullName: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phone: { type: 'string' },
        bio: { type: 'string' },
        avatar: { type: 'string' },
      },
    },
  })
  @Get('me')
  getProfile(@Req() req: Request & { user: { id: string } }) {
    const id = req.user.id;
    return this.usersService.getProfile(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update user profile' })
  @ApiOkResponse({
    description: 'Profile updated successfully',
  })
  @Put('profile')
  updateProfile(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    const id = req.user.id;
    return this.usersService.updateProfile(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Change user password' })
  @ApiOkResponse({
    description: 'Password changed successfully',
  })
  @Post('change-password')
  changePassword(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    const id = req.user.id;
    return this.usersService.changePassword(id, dto);
  }
}
