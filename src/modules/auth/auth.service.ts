import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '@/modules/users/users.service';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async validateUser(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isValid = await bcrypt.compare(pass, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, roles: [user.role] };
    const access_token = await this.jwtService.signAsync(payload);
    return access_token;
  }

  async validateGoogleToken(idToken: string) {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedException('Invalid Google token');
    }
    return { email: payload.email, name: payload.name || payload.email };
  }

  async loginWithGoogle(idToken: string) {
    const googlePayload = await this.validateGoogleToken(idToken);
    const user = await this.usersService.findOrCreateGoogleUser(
      googlePayload.email,
      googlePayload.name,
    );
    const access_token = await this.login({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      access_token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
