import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<Pick<UsersService, 'getProfile'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            getProfile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  it('returns profile of current user', async () => {
    usersService.getProfile.mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      fullName: 'A',
      firstName: 'A',
      lastName: '',
      phone: '',
      bio: '',
      avatar:
        'https://www.gravatar.com/avatar/8c9a15b0f0e6c588d08e8e5f8f5e5e5e?s=200&d=identicon&r=g',
    });
    const req = { user: { id: '1' } } as unknown as Parameters<
      UsersController['getProfile']
    >[0];
    const res = await controller.getProfile(req);
    expect(res).toEqual(
      expect.objectContaining({ id: '1', email: 'a@b.com', fullName: 'A' }),
    );
    expect(usersService.getProfile).toHaveBeenCalledWith('1');
  });
});
