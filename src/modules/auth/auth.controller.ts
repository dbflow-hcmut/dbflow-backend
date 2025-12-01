import {
  Body,
  Controller,
  Post,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '@/modules/users/users.service';
import { RegisterDto } from '@/modules/users/dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticates user and sets JWT token in HTTP-only cookie',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Login successful, JWT token set in cookie',
    schema: {
      properties: {
        message: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
          },
        },
      },
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    const token = await this.authService.login({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        access_token: token,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User logout',
    description: 'Clears the JWT token cookie',
  })
  @ApiCookieAuth()
  @ApiOkResponse({
    description: 'Logout successful',
    schema: {
      properties: {
        message: { type: 'string' },
      },
    },
  })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });
    return { message: 'Logout successful' };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register account' })
  @ApiBody({ type: RegisterDto })
  async register(@Body() dto: RegisterDto) {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) {
      return { message: 'Email already in use' };
    }
    const user = await this.usersService.createUser(dto);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}
