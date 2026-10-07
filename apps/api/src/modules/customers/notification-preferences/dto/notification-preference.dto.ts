import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] as const;
const CATEGORIES = ['STITCHING_PROGRESS', 'MARKETING', 'BACK_IN_STOCK'] as const;

export class NotificationPreferenceCellDto {
  @ApiPropertyOptional({ enum: CHANNELS })
  @IsIn(CHANNELS)
  channel!: (typeof CHANNELS)[number];

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: [NotificationPreferenceCellDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceCellDto)
  updates!: NotificationPreferenceCellDto[];
}
