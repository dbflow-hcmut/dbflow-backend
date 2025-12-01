import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async createUser(dto: RegisterDto): Promise<UserEntity> {
    const password = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      email: dto.email,
      fullName: dto.fullName,
      password,
    });
    return this.usersRepo.save(user);
  }

  async getProfile(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const emailHash = this.generateEmailHash(user.email);
    const avatar = `https://www.gravatar.com/avatar/${emailHash}?s=200&d=identicon&r=g`;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatar: avatar,
    };
  }

  private generateEmailHash(email: string): string {
    return crypto
      .createHash('md5')
      .update(email.toLowerCase().trim())
      .digest('hex');
  }
}
