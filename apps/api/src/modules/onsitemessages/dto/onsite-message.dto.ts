import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES, ONSITE_MESSAGE_KINDS, ONSITE_POPUP_TRIGGERS } from '@newax/shared';

export class OnsiteMessageTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ctaLabel?: string;
}

export class CreateOnsiteMessageDto {
  @ApiProperty({ enum: ONSITE_MESSAGE_KINDS })
  @IsIn(ONSITE_MESSAGE_KINDS)
  kind!: (typeof ONSITE_MESSAGE_KINDS)[number];

  @ApiPropertyOptional({ description: 'A path prefix ("/", "/shop", "/product") — omit to target every page.' })
  @IsOptional()
  @IsString()
  pagePattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  segmentId?: string;

  @ApiPropertyOptional({ enum: ONSITE_POPUP_TRIGGERS, default: 'IMMEDIATE' })
  @IsOptional()
  @IsIn(ONSITE_POPUP_TRIGGERS)
  trigger?: (typeof ONSITE_POPUP_TRIGGERS)[number];

  @ApiPropertyOptional({ description: 'Seconds before showing. TIMED trigger only.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  delaySeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ type: [OnsiteMessageTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnsiteMessageTranslationDto)
  translations!: OnsiteMessageTranslationDto[];
}

export class UpdateOnsiteMessageDto {
  @ApiPropertyOptional({ enum: ONSITE_MESSAGE_KINDS })
  @IsOptional()
  @IsIn(ONSITE_MESSAGE_KINDS)
  kind?: (typeof ONSITE_MESSAGE_KINDS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pagePattern?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  segmentId?: string | null;

  @ApiPropertyOptional({ enum: ONSITE_POPUP_TRIGGERS })
  @IsOptional()
  @IsIn(ONSITE_POPUP_TRIGGERS)
  trigger?: (typeof ONSITE_POPUP_TRIGGERS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  delaySeconds?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({ type: [OnsiteMessageTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnsiteMessageTranslationDto)
  translations?: OnsiteMessageTranslationDto[];
}

export class NewsletterSignupDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';
}
