import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProjectGroupDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Group to scope this project to. Omit/null to share with the whole team.',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}
