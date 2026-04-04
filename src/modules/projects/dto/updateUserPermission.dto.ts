import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';

export class UpdateUserPermissionDto {
  @ApiProperty({
    enum: UserProjectPermission,
    example: UserProjectPermission.Editor,
  })
  @IsNotEmpty()
  @IsEnum(UserProjectPermission)
  permission: UserProjectPermission;
}
