import { ApiProperty } from '@nestjs/swagger';
import { ProjectVisibility } from '@/common/enums/project-visibility.enum';
import { MetaResponseDto } from '@/common/dto/success-response.dto';
import { UserProjectPermission } from '@/common/enums/user-project-permission.enum';

export class ProjectResponseDto {
  @ApiProperty({ example: '22fa572f-27d2-402b-8098-b4c9885f6815' })
  id: string;

  @ApiProperty({ example: 'ddddcbbd-6d3c-4990-b7d0-dc70b16b11b1' })
  ownerId: string;

  @ApiProperty({ example: 'Quản lý bệnh viện' })
  name: string;

  @ApiProperty({
    enum: ProjectVisibility,
    example: ProjectVisibility.OwnerAndInvited,
  })
  visibility: ProjectVisibility;

  @ApiProperty({ example: '2025-11-22T10:55:09.619Z' })
  createdAt: Date;

  @ApiProperty({ example: '2025-11-22T10:55:09.619Z' })
  updatedAt: Date;
}

class OwnerDto {
  @ApiProperty({ example: '3' })
  id: string;

  @ApiProperty({ example: 'Mike Johnson' })
  name: string;

  @ApiProperty({ example: 'mike.johnson@example.com' })
  email: string;

  @ApiProperty({
    example:
      'https://www.gravatar.com/avatar/8c9a15b0f0e6c588d08e8e5f8f5e5e5e?s=200&d=identicon&r=g',
  })
  avatar: string;
}

export class GetAllProjectsItemDto {
  @ApiProperty({ example: '3' })
  id: string;

  @ApiProperty({ example: 'E-commerce Platform' })
  name: string;

  @ApiProperty({ type: OwnerDto })
  owner: OwnerDto;

  @ApiProperty({ example: '2024-01-20' })
  createdAt: string;

  @ApiProperty({ example: '2024-03-22' })
  updatedAt: string;

  @ApiProperty({ example: 'active' })
  status: string;
}

class CreateProjectMetaDto {
  @ApiProperty({ example: 201 })
  statusCode: number;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class CreateProjectSuccessResponseDto {
  @ApiProperty({ type: CreateProjectMetaDto })
  meta: CreateProjectMetaDto;

  @ApiProperty({ type: GetAllProjectsItemDto })
  data: GetAllProjectsItemDto;
}

export class GetProjectSuccessResponseDto {
  @ApiProperty({ type: MetaResponseDto })
  meta: MetaResponseDto;

  @ApiProperty({ type: GetAllProjectsItemDto })
  data: GetAllProjectsItemDto;
}

export class ProjectWithPermissionResponseDto extends ProjectResponseDto {
  @ApiProperty({ example: 'editor' })
  userPermission: UserProjectPermission;
}

class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 25 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class GetAllProjectsDataDto {
  @ApiProperty({ type: [GetAllProjectsItemDto] })
  items: GetAllProjectsItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination: PaginationDto;
}

export class GetAllProjectsSuccessResponseDto {
  @ApiProperty({ type: MetaResponseDto })
  meta: MetaResponseDto;

  @ApiProperty({ type: GetAllProjectsDataDto })
  data: GetAllProjectsDataDto;
}
