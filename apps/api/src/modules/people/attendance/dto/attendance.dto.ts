import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const KINDS = ['IN', 'OUT', 'BREAK_START', 'BREAK_END'] as const;

export class PunchDto {
  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @IsDateString()
  occurredAt!: string;

  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @IsString()
  @IsNotEmpty()
  orgUnitId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalRef?: string;
}

export class ManagerPunchDto extends PunchDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class ResolveExceptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class AdjustDto {
  @IsString()
  @IsNotEmpty()
  originalEventId!: string;

  @IsDateString()
  originalEventOccurredAt!: string;

  @IsDateString()
  newOccurredAt!: string;

  @IsIn(KINDS)
  newKind!: (typeof KINDS)[number];

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approverId?: string;
}

export class CreateShiftDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  orgUnitId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @IsNotEmpty()
  timezone!: string;
}
