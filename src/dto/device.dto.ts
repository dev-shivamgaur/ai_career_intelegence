import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeviceDto {
  @ApiProperty({
    example: 'device-local-id-abc123',
    description: 'Client-side unique device identifier',
  })
  @IsString()
  clientDeviceId!: string;

  @ApiPropertyOptional({ example: "Shivam's Vivobook Pro" })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({
    example: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)...',
  })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ example: 'windoOS' })
  @IsOptional()
  @IsString()
  os?: string;

  @ApiPropertyOptional({ example: 'Chrome' })
  @IsOptional()
  @IsString()
  browser?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: '1440x900' })
  @IsOptional()
  @IsString()
  screenResolution?: string;
}
