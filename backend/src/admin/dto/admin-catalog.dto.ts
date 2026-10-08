import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CareerTrack,
  EducationLevel,
  GovernmentExamCategory,
  Priority,
  RequirementType,
  Role,
  WorkType,
} from '../../prisma/client';

export class AdminProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryStack?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prepGoalText?: string;

  @ApiPropertyOptional({ enum: CareerTrack })
  @IsOptional()
  @IsEnum(CareerTrack)
  careerTrack?: CareerTrack;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;
}

export class AdminUserSkillDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  proficiency?: number;
}

export class AdminUserSkillPatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  proficiency?: number;
}

export class SkillDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  category!: string;
}

export class UpdateSkillDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
// http://localhost:5173/jobs,
// http://localhost:5173/opportunities,
// http://localhost:5173/copilot

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class CareerRequirementDto {
  @ApiProperty({ description: 'Skill name. Created automatically when it does not exist yet.' })
  @IsString()
  @MinLength(1)
  skillName!: string;

  @ApiPropertyOptional({ description: 'Category used only when the skill has to be created.' })
  @IsOptional()
  @IsString()
  skillCategory?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  importance?: Priority;

  @ApiPropertyOptional({ enum: RequirementType })
  @IsOptional()
  @IsEnum(RequirementType)
  type?: RequirementType;
}

export class CreateCareerDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  slug!: string;

  @ApiProperty()
  @IsString()
  overview!: string;

  @ApiProperty()
  @IsString()
  marketExpectations!: string;

  @ApiProperty()
  @IsString()
  entryLevelExpectations!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  syllabusSlug?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coreTopics?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  stackLanes?: unknown;

  @ApiPropertyOptional({ type: [CareerRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CareerRequirementDto)
  requirements?: CareerRequirementDto[];
}

export class UpdateCareerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overview?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketExpectations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entryLevelExpectations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  syllabusSlug?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coreTopics?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  stackLanes?: unknown;
}

export class ReplaceLaneSkillsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Comma-separated skill names. Used when skills is omitted.' })
  @IsOptional()
  @IsString()
  text?: string;
}

export class UpdateRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skillName?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  importance?: Priority;

  @ApiPropertyOptional({ enum: RequirementType })
  @IsOptional()
  @IsEnum(RequirementType)
  type?: RequirementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  layer?: string;
}

export class ReplaceRequirementsDto {
  @ApiProperty({ type: [CareerRequirementDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CareerRequirementDto)
  requirements!: CareerRequirementDto[];
}

export class JobSkillDto {
  @ApiProperty()
  @IsString()
  skillName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMissing?: boolean;
}

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  company!: string;

  @ApiProperty()
  @IsString()
  role!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: WorkType })
  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  experience?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whyMatches?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Marks the row as demo/mock content.' })
  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;

  @ApiPropertyOptional({ type: [JobSkillDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobSkillDto)
  skills?: JobSkillDto[];
}

export class UpdateJobDto extends CreateJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare company: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare role: string;
}

export class ExamSubjectDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  weightage?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateExamDto {
  @ApiProperty()
  @IsString()
  slug!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  shortName!: string;

  @ApiProperty()
  @IsString()
  conductingBody!: string;

  @ApiProperty({ enum: GovernmentExamCategory })
  @IsEnum(GovernmentExamCategory)
  category!: GovernmentExamCategory;

  @ApiProperty()
  @IsString()
  overview!: string;

  @ApiProperty()
  @IsString()
  eligibility!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ageLimit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  educationRequirement?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  examPattern?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  officialNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;

  @ApiPropertyOptional({ type: [ExamSubjectDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamSubjectDto)
  subjects?: ExamSubjectDto[];
}

export class UpdateExamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conductingBody?: string;

  @ApiPropertyOptional({ enum: GovernmentExamCategory })
  @IsOptional()
  @IsEnum(GovernmentExamCategory)
  category?: GovernmentExamCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overview?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eligibility?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ageLimit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  educationRequirement?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  examPattern?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  officialNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;
}

export class ReplaceSubjectsDto {
  @ApiProperty({ type: [ExamSubjectDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamSubjectDto)
  subjects!: ExamSubjectDto[];
}

export class CreateOpportunityDto {
  @ApiProperty()
  @IsString()
  organization!: string;

  @ApiProperty()
  @IsString()
  opportunity!: string;

  @ApiProperty()
  @IsString()
  eligibility!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ageRequirement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  educationRequirement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceVerification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  officialNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;
}

export class UpdateOpportunityDto extends CreateOpportunityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare organization: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare opportunity: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare eligibility: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}
