import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserEntity } from './user.entity';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));
import * as bcrypt from 'bcryptjs';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};
function createRepoMock(): MockRepo {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: MockRepo;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: createRepoMock(),
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(UserEntity));
  });

  it('findByEmail returns user', async () => {
    const user = { id: '1', email: 'a@b.com' } as { id: string; email: string };
    repo.findOne.mockResolvedValue(user);
    await expect(service.findByEmail('a@b.com')).resolves.toBe(
      user as unknown as UserEntity,
    );
    expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
  });

  it('createUser hashes password and saves', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    repo.create.mockImplementation(
      (v: Partial<UserEntity>): UserEntity => v as UserEntity,
    );
    repo.save.mockImplementation((v: UserEntity): UserEntity => {
      const withoutId = v as unknown as Omit<UserEntity, 'id'>;
      return { ...withoutId, id: '1' } as UserEntity;
    });

    const dto = { email: 'a@b.com', password: 'p', fullName: 'A' } as {
      email: string;
      password: string;
      fullName: string;
    };
    const res = await service.createUser(dto);

    expect(bcrypt.hash).toHaveBeenCalledWith('p', 10);
    expect(repo.create).toHaveBeenCalledWith({
      email: 'a@b.com',
      fullName: 'A',
      password: 'hashed',
    });
    expect(res).toMatchObject({ id: '1', email: 'a@b.com', fullName: 'A' });
  });

  it('getProfile returns basic info when found', async () => {
    const stored = { id: '1', email: 'a@b.com', fullName: 'A' } as {
      id: string;
      email: string;
      fullName: string;
    };
    repo.findOne.mockResolvedValue(stored);
    await expect(service.getProfile('1')).resolves.toEqual(
      expect.objectContaining({
        id: '1',
        email: 'a@b.com',
        fullName: 'A',
      }),
    );
  });

  it('getProfile throws when not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.getProfile('x')).rejects.toThrow('User not found');
  });
});
