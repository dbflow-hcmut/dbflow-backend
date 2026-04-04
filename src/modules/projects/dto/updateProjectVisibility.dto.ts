import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectVisibility } from '@/common/enums/project-visibility.enum';

export class UpdateProjectVisibilityDto {
  @ApiProperty({
    enum: ProjectVisibility,
    example: ProjectVisibility.AnyoneCanView,
  })
  @IsNotEmpty()
  @IsEnum(ProjectVisibility)
  projectMode: ProjectVisibility;
}
