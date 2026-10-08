import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SkillAliasStatus } from '../../prisma/client';

export class CreateSkillDomainDto {
  @ApiProperty({ example: 'observability' })
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'key must be lowercase kebab-case' })
  @MaxLength(48)
  key!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateSkillDomainDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SetSkillDomainDto {
  @ApiPropertyOptional({ description: 'Domain key, or null to clear' })
  @IsOptional()
  @IsString()
  domainKey?: string | null;
}

export class CreateSkillAliasDto {
  @ApiProperty()
  @IsString()
  skillId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  alias!: string;
}

export class UpdateSkillAliasDto {
  @ApiProperty({ enum: SkillAliasStatus })
  @IsEnum(SkillAliasStatus)
  status!: SkillAliasStatus;
}
