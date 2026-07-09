import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';
    this.region = process.env.AWS_REGION || 'ap-southeast-2';

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  getPublicUrl(key: string): string {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async uploadFile(
    file: Express.Multer.File,
    key: string,
  ): Promise<{ key: string; url: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      });

      await this.s3Client.send(command);

      this.logger.log(`File uploaded successfully: ${key}`);

      const url = await this.getPresignedUrl(key);
      return { key, url };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error}`);
      throw error;
    }
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 900,
    readExpiresIn = 3600,
  ): Promise<{ key: string; uploadUrl: string; url: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });
      const url = await this.getPresignedUrl(key, readExpiresIn);
      return { key, uploadUrl, url };
    } catch (error) {
      this.logger.error(`Failed to generate presigned upload URL: ${error}`);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error}`);
      throw error;
    }
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error}`);
      throw error;
    }
  }

  async getFile(key: string): Promise<{
    stream: Readable;
    contentType: string;
    contentLength: number;
  }> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const headResult = await this.s3Client.send(headCommand);

      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const result = await this.s3Client.send(getCommand);

      if (!result.Body) {
        throw new NotFoundException('File not found');
      }

      this.logger.log(`File retrieved successfully: ${key}`);

      return {
        stream: result.Body as Readable,
        contentType: headResult.ContentType || 'application/octet-stream',
        contentLength: headResult.ContentLength || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get file: ${error}`);
      const err = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException(`File not found: ${key}`);
      }
      throw error;
    }
  }
  async putJsonObject(key: string, data: unknown): Promise<void> {
    try {
      const jsonString = JSON.stringify(data);
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: jsonString,
        ContentType: 'application/json',
      });

      await this.s3Client.send(command);
      this.logger.log(`JSON object saved successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to save JSON object: ${error}`);
      throw error;
    }
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      this.logger.log(`Binary object saved successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to save binary object: ${error}`);
      throw error;
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      if (!response.Body) {
        return null;
      }

      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      const err = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        this.logger.warn(`Binary object not found: ${key}`);
        return null;
      }
      this.logger.error(`Failed to get binary object: ${error}`);
      throw error;
    }
  }

  async getJsonObject<T>(key: string): Promise<T | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      if (!response.Body) {
        return null;
      }

      const str = await response.Body.transformToString();
      return JSON.parse(str) as T;
    } catch (error) {
      const err = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        this.logger.warn(`JSON object not found: ${key}`);
        return null;
      }
      this.logger.error(`Failed to get JSON object: ${error}`);
      throw error;
    }
  }
}
