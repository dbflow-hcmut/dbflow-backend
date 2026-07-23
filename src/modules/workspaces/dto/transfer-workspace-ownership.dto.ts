import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferWorkspaceOwnershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetUserId: string;
}
