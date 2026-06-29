import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@/modules/users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { S3Service } from '@/modules/s3/s3.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly s3Service: S3Service,
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

  async findOrCreateGoogleUser(
    email: string,
    fullName: string,
    pictureUrl?: string,
  ): Promise<UserEntity> {
    const existing = await this.findByEmail(email);
    if (existing) {
      // Update Google avatar only if user hasn't set a custom S3 avatar
      if (pictureUrl && (!existing.avatarKey || existing.avatarKey.startsWith('http'))) {
        existing.avatarKey = pictureUrl;
        await this.usersRepo.save(existing);
      }
      return existing;
    }

    const randomPassword = await bcrypt.hash(crypto.randomUUID(), 10);
    const user = this.usersRepo.create({
      email,
      fullName,
      password: randomPassword,
      avatarKey: pictureUrl || undefined,
    });
    return this.usersRepo.save(user);
  }

  async getProfile(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const avatar = this.resolveAvatarUrl(user);

    // If firstName and lastName are not set, try to split fullName
    let firstName = user.firstName;
    let lastName = user.lastName;

    if (!firstName && !lastName && user.fullName) {
      const nameParts = user.fullName.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      firstName: firstName || '',
      lastName: lastName || '',
      phone: user.phone || '',
      bio: user.bio || '',
      avatar,
    };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete old S3 avatar if being replaced with a different key
    if (
      dto.avatarKey !== undefined &&
      user.avatarKey &&
      !user.avatarKey.startsWith('http') &&
      user.avatarKey !== dto.avatarKey
    ) {
      this.s3Service.deleteFile(user.avatarKey).catch(() => {});
    }

    user.firstName = dto.firstName;
    user.lastName = dto.lastName ?? '';
    user.phone = dto.phone || '';
    user.bio = dto.bio || '';
    user.fullName = `${dto.firstName} ${dto.lastName ?? ''}`.trim();

    if (dto.avatarKey !== undefined) {
      user.avatarKey = dto.avatarKey;
    }

    await this.usersRepo.save(user);

    return this.getProfile(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash and update new password
    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepo.save(user);

    return { message: 'Password changed successfully' };
  }

  private resolveAvatarUrl(user: UserEntity): string {
    if (user.avatarKey) {
      if (user.avatarKey.startsWith('http')) {
        return user.avatarKey;
      }
      return this.s3Service.getPublicUrl(user.avatarKey);
    }
    const emailHash = this.generateEmailHash(user.email);
    return `https://www.gravatar.com/avatar/${emailHash}?s=200&d=identicon&r=g`;
  }

  private generateEmailHash(email: string): string {
    return crypto
      .createHash('md5')
      .update(email.toLowerCase().trim())
      .digest('hex');
  }
}
