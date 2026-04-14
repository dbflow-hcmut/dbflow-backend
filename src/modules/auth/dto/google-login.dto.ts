import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token from OAuth flow' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
