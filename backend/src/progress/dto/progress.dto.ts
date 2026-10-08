import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProgressEventDto {
  @ApiProperty({ example: 'roadmap_task_completed' })
  @IsString()
  @MinLength(2)
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
