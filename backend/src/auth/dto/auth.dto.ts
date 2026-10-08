import { IsString, Matches, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phone must be E.164 format' })
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  code!: string;

  @ApiPropertyOptional({ description: 'Optional display name on first signup' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Optional if refresh_token cookie is set' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
