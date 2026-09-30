import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const LEAVE_DECISIONS = ['APPROVED', 'REJECTED'] as const;

export class RequestLeaveDto {
  @ApiPropertyOptional()
  @IsString()
  leaveTypeId!: string;

  @ApiPropertyOptional()
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}

export class DecideLeaveDto {
  @ApiPropertyOptional({ enum: LEAVE_DECISIONS })
  @IsIn(LEAVE_DECISIONS)
  status!: (typeof LEAVE_DECISIONS)[number];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
