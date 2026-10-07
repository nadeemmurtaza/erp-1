import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRankDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsInt()
  level!: number;
}

export class CreatePositionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  orgUnitId!: string;

  @IsString()
  @IsNotEmpty()
  rankId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportsToId?: string;
}

export class AssignPostingDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  positionId!: string;

  @IsBoolean()
  isPrimary!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedOn?: string;
}

export class EndPostingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endedOn?: string;
}
