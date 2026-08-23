import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Mirrors AnalyticsEvent.type's comment in core.prisma — keep the two in sync. */
export const TRACKED_EVENT_TYPES = ['page_view', 'add_to_cart', 'checkout_started'] as const;

export type TrackedEventType = (typeof TRACKED_EVENT_TYPES)[number];

export class TrackEventDto {
  @ApiProperty({ enum: TRACKED_EVENT_TYPES })
  @IsIn(TRACKED_EVENT_TYPES)
  type!: TrackedEventType;

  @ApiPropertyOptional({ description: 'The route the event happened on, e.g. /en/product/lawn-suit-42' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @ApiPropertyOptional({ description: 'document.referrer, used only to classify source server-side' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referrer?: string;

  @ApiPropertyOptional({ description: 'utm_source query param, used only to classify source server-side' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @ApiProperty({
    description:
      'Opaque, anonymous, client-generated id (e.g. crypto.randomUUID()) — never a user id',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
