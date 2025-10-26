import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    schema: { properties: { access_token: { type: 'string' } } },
  })
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    return this.authService.login({
      id: user.id,
      email: user.email,
      role: user.role,
    });
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
