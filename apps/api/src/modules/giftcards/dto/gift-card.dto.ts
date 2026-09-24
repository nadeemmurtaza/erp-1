import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

const GIFT_CARD_STATUSES = ['ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED'] as const;

export class IssueGiftCardDto {
  @ApiPropertyOptional({ description: 'Paisa.' })
  @IsInt()
  @Min(100)
  initialValue!: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  recipientName?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  recipientEmail?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  recipientPhone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  expiresAt?: string;
}

export class GiftCardQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GIFT_CARD_STATUSES })
  @IsIn(GIFT_CARD_STATUSES)
  @IsOptional()
  status?: (typeof GIFT_CARD_STATUSES)[number];
}

export class RedeemGiftCardDto {
  @ApiPropertyOptional()
  @IsString()
  code!: string;

  @ApiPropertyOptional({ description: 'Paisa.' })
  @IsInt()
  @Min(1)
  amount!: number;
}
