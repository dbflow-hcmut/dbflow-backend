import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '@/modules/users/users.service';
import { UserEntity } from '@/modules/users/user.entity';
import { Role } from '@/common/enums/role.enum';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { UserStatus } from '@/common/enums/user-status.enum';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmail'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
        {
          provide: WorkspacesService,
          useValue: {
            ensurePersonalWorkspace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  describe('validateUser', () => {
    it('throws when user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.validateUser('a@b.com', 'pass'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when password invalid', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'a@b.com',
        fullName: 'A',
        firstName: 'A',
        lastName: '',
        phone: '',
        bio: '',
        password: 'hash',
        role: Role.User,
        status: UserStatus.Active,
        suspendedAt: null,
        suspendedReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserEntity);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.validateUser('a@b.com', 'wrong'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns user when credentials valid', async () => {
      const user: UserEntity = {
        id: '1',
        email: 'a@b.com',
        fullName: 'A',
        firstName: 'A',
        lastName: '',
        phone: '',
        bio: '',
        avatarKey: null,
        password: 'hash',
        role: Role.User,
        status: UserStatus.Active,
        suspendedAt: null,
        suspendedReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.validateUser('a@b.com', 'ok')).resolves.toBe(user);
    });
  });

  describe('login', () => {
    it('returns access token', async () => {
      jwtService.signAsync.mockResolvedValue('signed-token');
      const token = await service.login({
        id: '1',
        email: 'a@b.com',
        role: 'User',
      });
      expect(token).toEqual('signed-token');
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: '1',
        email: 'a@b.com',
        roles: ['User'],
      });
    });
  });
});
