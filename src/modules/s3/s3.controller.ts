import {
  Controller,
  Post,
  Get,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  StreamableFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
} from '@nestjs/swagger';
import { S3Service } from './s3.service';
import { UploadFileDto, UploadResponseDto } from './dto/upload.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@ApiTags('s3')
@Controller('s3')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload file to S3',
    description: 'Upload a file to S3 bucket with a specified key/path',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'key'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload',
        },
        key: {
          type: 'string',
          description: 'S3 key/path for the file',
          example: 'uploads/images/profile-123.jpg',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'File uploaded successfully',
    type: UploadResponseDto,
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!dto.key) {
      throw new BadRequestException('Key is required');
    }

    return this.s3Service.uploadFile(file, dto.key);
  }

  @Get('file')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Download file from S3',
    description: 'Download/stream a file from S3 private bucket by key',
  })
  @ApiQuery({
    name: 'key',
    description: 'S3 key/path of the file',
    example: 'uploads/buildings-5141841_1280.jpg',
    required: true,
    type: String,
  })
  @ApiProduces('application/octet-stream', 'image/*', 'video/*', 'audio/*')
  @ApiOkResponse({
    description: 'File stream',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async getFile(@Query('key') key: string): Promise<StreamableFile> {
    if (!key) {
      throw new BadRequestException('Key is required');
    }

    const { stream, contentType } = await this.s3Service.getFile(key);

    return new StreamableFile(stream, {
      type: contentType,
      disposition: `inline; filename="${key.split('/').pop()}"`,
    });
  }
}
