import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateMarketingSettingsDto {
  @ApiPropertyOptional({
    description: 'Master switch. Off by default — no automated marketing send happens until this is true.',
  })
  @IsOptional()
  @IsBoolean()
  automationEnabled?: boolean;

  @ApiPropertyOptional({ description: "Cart idle hours before the abandoned-cart reminder (logged-in customers only)." })
  @IsOptional()
  @IsInt()
  @Min(1)
  abandonedCartReminderHours?: number;

  @ApiPropertyOptional({ description: 'Further idle hours after the reminder before the incentive follow-up.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  abandonedCartIncentiveHours?: number;

  @ApiPropertyOptional({ description: 'Days after delivery before the review-request email.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  reviewRequestDays?: number;

  @ApiPropertyOptional({
    description: 'Days after delivery before a Product.isConsumable purchase gets a reorder nudge.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  replenishmentReminderDays?: number;
}
