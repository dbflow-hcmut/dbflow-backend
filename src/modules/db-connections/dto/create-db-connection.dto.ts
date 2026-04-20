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

export class CreateDbConnectionDto {
  @ApiProperty({ example: 'Production PostgreSQL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

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
  @MaxLength(255)
  username?: string;

  @ApiPropertyOptional({ example: 'secret' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  ssl?: boolean;

  // SSH fields
  @ApiPropertyOptional({ example: 'bastion.example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sshHost?: string;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  sshPort?: number;

  @ApiPropertyOptional({ example: 'ubuntu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sshUsername?: string;

  @ApiPropertyOptional({ enum: SshAuthType, example: SshAuthType.Password })
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

  // Optional: link to a project right away
  @ApiPropertyOptional({ example: 'uuid-of-project' })
  @IsOptional()
  @IsString()
  projectId?: string;
}
