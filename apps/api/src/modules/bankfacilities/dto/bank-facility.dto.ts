import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

const FACILITY_TYPES = ['TERM_LOAN', 'RUNNING_FINANCE', 'OVERDRAFT', 'LETTER_OF_CREDIT', 'BANK_GUARANTEE'] as const;

export class CreateBankDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreateBankFacilityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ enum: FACILITY_TYPES })
  @IsIn(FACILITY_TYPES)
  facilityType!: (typeof FACILITY_TYPES)[number];

  @ApiProperty()
  @IsInt()
  @IsPositive()
  limitMinor!: number;

  @ApiProperty({ description: 'Annual markup rate in basis points — 2200 = 22.00%.' })
  @IsInt()
  @Min(0)
  markupRateBps!: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isFloatingRate?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  securityReference?: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  maturityDate!: string;
}

export class RecordDrawdownDto {
  @ApiProperty()
  @IsInt()
  @IsPositive()
  amountMinor!: number;

  @ApiProperty()
  @IsDateString()
  drawdownDate!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}

export class RecordRepaymentDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  principalMinor?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  markupMinor?: number;

  @ApiProperty()
  @IsDateString()
  repaymentDate!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
