import { ApiProperty } from '@nestjs/swagger';

class ErrorMetaDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Error message' })
  message: string | string[];
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorMetaDto })
  meta: ErrorMetaDto;

  @ApiProperty({ nullable: true })
  data: unknown;
}

export class BadRequestResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 400 },
      message: { type: 'string', example: 'name should not be empty' },
    },
  })
  meta: {
    statusCode: 400;
    message: string | string[];
  };

  @ApiProperty({ nullable: true })
  data: unknown;
}

export class UnauthorizedResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 401 },
      message: { type: 'string', example: 'Unauthorized' },
    },
  })
  meta: {
    statusCode: 401;
    message: string;
  };

  @ApiProperty({ nullable: true })
  data: unknown;
}

export class ForbiddenResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 403 },
      message: { type: 'string', example: 'Forbidden' },
    },
  })
  meta: {
    statusCode: 403;
    message: string;
  };

  @ApiProperty({ nullable: true })
  data: unknown;
}

export class NotFoundResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 404 },
      message: { type: 'string', example: 'Not found' },
    },
  })
  meta: {
    statusCode: 404;
    message: string;
  };

  @ApiProperty({ nullable: true })
  data: unknown;
}

export class InternalServerErrorResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 500 },
      message: { type: 'string', example: 'Internal server error' },
    },
  })
  meta: {
    statusCode: 500;
    message: string;
  };

  @ApiProperty({ nullable: true })
  data: unknown;
}

