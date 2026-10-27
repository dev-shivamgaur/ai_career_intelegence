import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class StartPrepDto {
  @IsOptional()
  @IsString()
  skillId?: string;

  @IsOptional()
  @IsString()
  roadmapTaskId?: string;

  @IsOptional()
  @IsBoolean()
  generate?: boolean;

  /** Pin an exact published package. */
  @IsOptional()
  @IsString()
  packageId?: string;

  /** Pin a published version number for the skill. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  packageVersion?: number;

  /**
   * When true and an open session is on another package, abandon it and
   * start/resume the requested package version.
   */
  @IsOptional()
  @IsBoolean()
  switchVersion?: boolean;
}

export class AttemptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  questionKey!: string;

  @IsString()
  @MaxLength(8000)
  answer!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(80)
  idempotencyKey!: string;
}

export class TaskEvidenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  taskKey!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(4000)
  evidence!: string;
}

export class HintDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  questionKey!: string;
}
