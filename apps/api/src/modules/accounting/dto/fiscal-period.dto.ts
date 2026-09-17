import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateFiscalYearDto {
  @ApiProperty({ example: 'FY2026' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsDateString()
  startsOn!: string;

  @ApiProperty()
  @IsDateString()
  endsOn!: string;
}

export class CreateFiscalPeriodDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fiscalYearId!: string;

  @ApiProperty({ example: '2026-01' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsDateString()
  startsOn!: string;

  @ApiProperty()
  @IsDateString()
  endsOn!: string;
}
