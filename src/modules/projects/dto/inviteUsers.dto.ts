import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';

class InviteUserItemDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({
    enum: UserProjectPermission,
    example: UserProjectPermission.Viewer,
  })
  @IsNotEmpty()
  @IsEnum(UserProjectPermission)
  invite_permission: UserProjectPermission;
}

export class InviteUsersDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  sendEmail: boolean;

  @ApiPropertyOptional({ example: 'Please join our project!' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ type: [InviteUserItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteUserItemDto)
  users: InviteUserItemDto[];
}
