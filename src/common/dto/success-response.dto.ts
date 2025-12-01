import { ApiProperty } from '@nestjs/swagger';

export class MetaResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'success' })
  message: string | string[];
}

export class StandardResponseDto<T> {
  @ApiProperty({ type: MetaResponseDto })
  meta: MetaResponseDto;

  @ApiProperty()
  data: T;
}
