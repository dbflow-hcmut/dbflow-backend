import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateDbConnectionDto } from './create-db-connection.dto';

export class UpdateDbConnectionDto extends PartialType(
  OmitType(CreateDbConnectionDto, ['projectId'] as const),
) {}
