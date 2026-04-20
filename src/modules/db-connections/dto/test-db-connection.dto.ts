import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DbConnectionDbms,
  DbConnectionMethod,
  SshAuthType,
} from '@/common/enums/db-connection.enum';

export class TestDbConnectionDto {
  @ApiProperty({ enum: DbConnectionDbms, example: DbConnectionDbms.PostgreSQL })
  @IsEnum(DbConnectionDbms)
  dbms: DbConnectionDbms;

  @ApiProperty({
    enum: DbConnectionMethod,
    example: DbConnectionMethod.Direct,
  })
  @IsEnum(DbConnectionMethod)
  method: DbConnectionMethod;

  @ApiProperty({ example: 'db.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host: string;

  @ApiPropertyOptional({ example: 5432 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  port?: number;

  @ApiProperty({ example: 'mydb' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  database: string;

  @ApiPropertyOptional({ example: 'postgres' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'secret' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  ssl?: boolean;

  @ApiPropertyOptional({ example: 'bastion.example.com' })
  @IsOptional()
  @IsString()
  sshHost?: string;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @IsInt()
  sshPort?: number;

  @ApiPropertyOptional({ example: 'ubuntu' })
  @IsOptional()
  @IsString()
  sshUsername?: string;

  @ApiPropertyOptional({ enum: SshAuthType })
  @IsOptional()
  @IsEnum(SshAuthType)
  sshAuthType?: SshAuthType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sshPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sshPrivateKey?: string;
}
