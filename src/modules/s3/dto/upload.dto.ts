import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, MaxLength } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({
    description: 'S3 key/path where the file will be stored',
    example: 'uploads/images/profile-123.jpg',
  })
  @IsString()
  @IsNotEmpty()
  key: string;
}

export class UploadResponseDto {
  @ApiProperty({
    description: 'Public URL of the uploaded file',
    example: 'http://localhost:3000/s3/file?key=uploads/images/profile-123.jpg',
  })
  url: string;

  @ApiProperty({
    description: 'S3 key of the uploaded file',
    example: 'uploads/images/profile-123.jpg',
  })
  key: string;
}

export class PresignedUploadDto {
  @ApiProperty({
    description: 'Original file name',
    example: 'schema.pdf',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'MIME type',
    example: 'application/pdf',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1024,
  })
  @IsNumber()
  size: number;
}
