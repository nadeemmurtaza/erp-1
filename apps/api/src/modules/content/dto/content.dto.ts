import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BANNER_PLACEMENTS, LOCALES, MENU_KEYS } from '@newax/shared';
import { ContentStatus } from '../../../core/prisma/client';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

// --- Pages ------------------------------------------------------------

export class PageTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: [Object], description: 'ContentBlock[] — see @newax/shared/content-blocks' })
  @IsArray()
  body!: unknown[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogImageUrl?: string;
}

export class CreatePageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  slug!: string;

  @ApiPropertyOptional({ default: 'default' })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ContentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @ApiProperty({ type: [PageTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageTranslationDto)
  translations!: PageTranslationDto[];
}

export class UpdatePageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ContentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @ApiPropertyOptional({ type: [PageTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageTranslationDto)
  translations?: PageTranslationDto[];
}

// --- Blog posts ---------------------------------------------------------

export class BlogPostTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  body!: unknown[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  excerpt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogImageUrl?: string;
}

export class CreateBlogPostDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  slug!: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ContentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @ApiProperty({ type: [BlogPostTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogPostTranslationDto)
  translations!: BlogPostTranslationDto[];
}

export class UpdateBlogPostDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ContentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @ApiPropertyOptional({ type: [BlogPostTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogPostTranslationDto)
  translations?: BlogPostTranslationDto[];
}

// --- Banners --------------------------------------------------------------

export class BannerTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subtext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;
}

export class CreateBannerDto {
  @ApiProperty({ enum: BANNER_PLACEMENTS })
  @IsIn([...BANNER_PLACEMENTS])
  placementKey!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  imageUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  linkUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  order?: number;

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

  @ApiProperty({ type: [BannerTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BannerTranslationDto)
  translations!: BannerTranslationDto[];
}

export class UpdateBannerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  linkUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  order?: number;

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

  @ApiPropertyOptional({ type: [BannerTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BannerTranslationDto)
  translations?: BannerTranslationDto[];
}

// --- Menu items -------------------------------------------------------

export class MenuItemTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;
}

export class CreateMenuItemDto {
  @ApiProperty({ enum: MENU_KEYS })
  @IsIn([...MENU_KEYS])
  menuKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [MenuItemTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemTranslationDto)
  translations!: MenuItemTranslationDto[];
}

export class UpdateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [MenuItemTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemTranslationDto)
  translations?: MenuItemTranslationDto[];
}
