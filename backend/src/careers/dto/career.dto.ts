import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCareerGoalDto {
  @ApiProperty({ description: 'Career id or slug' })
  @IsString()
  careerIdOrSlug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customTitle?: string;
}

export class UpdateCareerGoalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customTitle?: string;
}
