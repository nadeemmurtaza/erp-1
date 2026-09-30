import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import type { BulletinCategory } from '../../../../core/prisma/client';

export class AudienceSpecDto {
  @ApiPropertyOptional({ description: 'NULL means the whole organization' })
  @IsOptional()
  @IsString()
  orgUnitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeDescendants?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  minRankLevel?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positionIds?: string[];
}

export class PreviewAudienceDto extends AudienceSpecDto {}

export class SendBroadcastDto {
  @ValidateNested()
  @Type(() => AudienceSpecDto)
  audience!: AudienceSpecDto;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}

export class DecideBroadcastDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @IsString()
  @IsNotEmpty()
  orgUnitId!: string;

  @ValidateNested()
  @Type(() => AudienceSpecDto)
  audience!: AudienceSpecDto;
}

export class RespondMeetingDto {
  @IsIn(['ACCEPTED', 'DECLINED', 'TENTATIVE'])
  response!: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
}

export class CreateEscalationRuleDto {
  @IsString()
  @IsNotEmpty()
  sourceType!: string;

  @IsInt()
  @Min(1)
  afterMinutes!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  stepsPerFire?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  ceilingRankLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxFires?: number;
}

const BULLETIN_CATEGORIES = ['POLICY', 'MEMO', 'NOTICE', 'HR_ANNOUNCEMENT'] as const;

export class PublishBulletinDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  bodyMarkdown!: string;

  @IsIn(BULLETIN_CATEGORIES)
  category!: BulletinCategory;

  @ApiPropertyOptional({ description: 'NULL means the whole organization' })
  @IsOptional()
  @IsString()
  audienceOrgUnitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresAcknowledgement?: boolean;
}

export class UpdateEscalationRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  afterMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  stepsPerFire?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  ceilingRankLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxFires?: number;
}
