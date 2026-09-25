import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const INSTALMENT_PLAN_TYPES = ['LAYBY', 'INSTALMENT'] as const;

export class InstalmentScheduleLineDto {
  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amountMinor!: number;
}

/**
 * finance-accounting/151-layby-installment-sales.md — requested at the
 * point of sale, alongside the ordinary line list. Omit entirely for an
 * ordinary immediate-tender-in-full sale, today's exact behaviour.
 */
export class PosInstalmentPlanDto {
  @ApiProperty({ enum: INSTALMENT_PLAN_TYPES })
  @IsIn(INSTALMENT_PLAN_TYPES)
  type!: (typeof INSTALMENT_PLAN_TYPES)[number];

  @ApiProperty()
  @IsInt()
  @Min(0)
  depositMinor!: number;

  @ApiProperty({ type: [InstalmentScheduleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InstalmentScheduleLineDto)
  schedule!: InstalmentScheduleLineDto[];
}

export class PosSaleLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreatePosSaleDto {
  @ApiProperty({ type: [PosSaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosSaleLineDto)
  lines!: PosSaleLineDto[];

  @ApiPropertyOptional({ description: 'Only when the cashier takes the details — a till sale is anonymous by default.' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ type: PosInstalmentPlanDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PosInstalmentPlanDto)
  instalmentPlan?: PosInstalmentPlanDto;
}
