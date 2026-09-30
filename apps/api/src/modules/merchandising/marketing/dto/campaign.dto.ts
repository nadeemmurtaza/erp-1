import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;

export class CreateCampaignDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: CHANNELS })
  @IsIn(CHANNELS)
  channel!: (typeof CHANNELS)[number];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  segmentId!: string;

  @ApiProperty({ description: 'locale -> { subject?, body } — subject read for EMAIL only' })
  @IsObject()
  content!: Record<string, { subject?: string; body: string }>;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  segmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  content?: Record<string, { subject?: string; body: string }>;
}

export class ScheduleCampaignDto {
  @ApiPropertyOptional({ description: 'Omit to send as soon as the dispatch cron next runs' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
