import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class RedeemPointsDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  points!: number;
}

export class AdjustLoyaltyPointsDto {
  @ApiPropertyOptional()
  @IsInt()
  points!: number; // signed — negative debits

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  note!: string;
}

export class UpsertLoyaltyTierDto {
  @ApiPropertyOptional()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  minSpend!: number;

  @ApiPropertyOptional()
  @IsString()
  benefitDescriptionEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  benefitDescriptionUr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ApplyReferralCodeDto {
  @ApiPropertyOptional()
  @IsString()
  code!: string;
}
