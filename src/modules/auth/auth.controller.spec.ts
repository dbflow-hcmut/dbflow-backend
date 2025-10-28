import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '@/modules/users/users.service';
import { UserEntity } from '@/modules/users/user.entity';
import { Role } from '@/common/enums/role.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Pick<AuthService, 'validateUser' | 'login'>>;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'createUser'>
  >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
            login: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            createUser: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    usersService = module.get(UsersService);
  });

  describe('login', () => {
    it('validates and returns token', async () => {
      const user: UserEntity = {
        id: '1',
        email: 'a@b.com',
        fullName: 'A',
        password: 'hash',
        role: Role.User,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      authService.validateUser.mockResolvedValue(user);
      authService.login.mockResolvedValue('token');

      const mockCookie = jest.fn();
      const mockResponse = {
        cookie: mockCookie,
      } as unknown as Response;

      const res = await controller.login(
        {
          email: 'a@b.com',
          password: 'p',
        } as { email: string; password: string },
        mockResponse,
      );

      expect(res).toEqual({
        message: 'Login successful',
        user: {
          id: '1',
          email: 'a@b.com',
          role: Role.User,
        },
      });
      expect(mockCookie).toHaveBeenCalledWith(
        'access_token',
        'token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 3600000,
        }),
      );
      expect(authService.validateUser).toHaveBeenCalledWith('a@b.com', 'p');
      expect(authService.login).toHaveBeenCalledWith({
        id: '1',
        email: 'a@b.com',
        role: Role.User,
      });
    });
  });

  describe('register', () => {
    it('returns message when email exists', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: '1',
      } as unknown as UserEntity);
      const res = await controller.register({
        email: 'a@b.com',
        password: 'x',
        fullName: 'A',
      } as { email: string; password: string; fullName: string });
      expect(res).toEqual({ message: 'Email already in use' });
      expect(usersService.findByEmail).toHaveBeenCalledWith('a@b.com');
    });

    it('creates user when email not used', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue({
        id: '2',
        email: 'a@b.com',
        fullName: 'A',
        password: 'hash',
        role: Role.User,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserEntity);

      const res = await controller.register({
        email: 'a@b.com',
        password: 'x',
        fullName: 'A',
      } as { email: string; password: string; fullName: string });
      expect(res).toEqual({
        id: '2',
        email: 'a@b.com',
        fullName: 'A',
        role: Role.User,
      });
      expect(usersService.createUser).toHaveBeenCalled();
    });
  });
});
