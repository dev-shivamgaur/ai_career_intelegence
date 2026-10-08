import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateResearchDto {
  @ApiPropertyOptional({ example: 'Backend Developer market skills' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careerSlug?: string;
}
