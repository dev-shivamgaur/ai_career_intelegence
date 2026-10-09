import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MarketDisplayPolicy, MarketSourceType } from '../../../prisma/client';
import { ALLOWED_USES } from '../compliance';

export class CreateCompanyDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'example-corp' })
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug must be lowercase kebab-case' })
  @MaxLength(80)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateMarketSourceDto {
  @ApiProperty()
  @IsString()
  companyId!: string;

  @ApiProperty({ enum: MarketSourceType })
  @IsEnum(MarketSourceType)
  type!: MarketSourceType;

  @ApiProperty({ description: 'Board token / site name / job board name from the public ATS URL' })
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/, { message: 'boardToken may contain letters, digits, dot, dash, underscore' })
  boardToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpdateMarketSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(24 * 14)
  crawlIntervalHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  storeRawPayload?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  rawPayloadRetentionDays?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  descriptionRetentionDays?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  evidenceExcerptMaxChars?: number | null;

  @ApiPropertyOptional({ enum: MarketDisplayPolicy })
  @IsOptional()
  @IsEnum(MarketDisplayPolicy)
  displayPolicy?: MarketDisplayPolicy;
}

export class RecordTermsReviewDto {
  @ApiProperty({ description: 'Terms / API policy page that was reviewed' })
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  termsUrl!: string;

  @ApiProperty({ description: 'What the terms allow and forbid, in the reviewer’s words' })
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  termsSummary!: string;

  @ApiProperty({ isArray: true, enum: ALLOWED_USES })
  @IsArray()
  @ArrayUnique()
  @IsIn(ALLOWED_USES as unknown as string[], { each: true })
  allowedUses!: string[];

  @ApiProperty()
  @IsBoolean()
  attributionRequired!: boolean;

  @ApiProperty({ description: 'When the review must be redone (at most 12 months ahead)' })
  @IsDateString()
  reviewDueAt!: string;
}
