import { IsOptional, IsString, IsInt, IsEnum, Min, Max, IsArray, ValidateNested, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { LearningStyle, RemotePreference, UserStatus, EducationLevel, CareerTrack } from '../../prisma/client';

export class ProjectInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Skills demonstrated by this project.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1950)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  link?: string;
}

export class EducationInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  degree!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  graduationYear?: number;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsOptional()
  @IsEnum(EducationLevel)
  level?: EducationLevel;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  availableHoursPerDay?: number;

  @ApiPropertyOptional({ enum: LearningStyle })
  @IsOptional()
  @IsEnum(LearningStyle)
  learningStyle?: LearningStyle;

  @ApiPropertyOptional({ enum: RemotePreference })
  @IsOptional()
  @IsEnum(RemotePreference)
  remotePreference?: RemotePreference;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent?: number;

  @ApiPropertyOptional({ enum: CareerTrack })
  @IsOptional()
  @IsEnum(CareerTrack)
  careerTrack?: CareerTrack;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careerSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customGoalTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prepGoalText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetExamSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  degree?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  graduationYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryStack?: string;

  @ApiPropertyOptional({
    type: [EducationInputDto],
    description: 'Class 10, Class 12, diploma, and degree rows. Does not wipe marksheet-detected rows.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationInputDto)
  education?: EducationInputDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({
    type: [ProjectInputDto],
    description: 'Replaces the saved project list when provided.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectInputDto)
  projects?: ProjectInputDto[];
}

export class CompleteOnboardingDto extends UpdateProfileDto {}
