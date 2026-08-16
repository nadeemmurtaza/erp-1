import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { STITCHING_STAGES } from '@yaseen/shared';

const STITCHING_ORDER_STATUSES = [
  'DRAFT',
  'AWAITING_FABRIC',
  'FABRIC_RECEIVED',
  'IN_PRODUCTION',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export class BookGarmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  garmentTypeId!: string;

  @ApiPropertyOptional({ description: 'A saved profile; needs an account' })
  @IsOptional()
  @IsString()
  measurementProfileId?: string;

  @ApiPropertyOptional({
    description: 'Measurements typed in directly, for a customer with no account',
    example: { length: 42, chest: 38 },
  })
  @IsOptional()
  @IsObject()
  measurements?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class BookStitchingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your name.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '03001234567' })
  @IsString()
  @IsNotEmpty({ message: 'We need a number to arrange collection.' })
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @ApiProperty({ type: [BookGarmentDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BookGarmentDto)
  garments!: BookGarmentDto[];

  @ApiPropertyOptional({ description: 'Where we collect the fabric' })
  @IsOptional()
  @IsObject()
  pickupAddress?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  deliveryAddress?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'What the fabric is, how much of it' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fabricNotes?: string;
}

export class TrackStitchingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class ChangeStageDto {
  @ApiProperty({ enum: STITCHING_STAGES })
  @IsIn([...STITCHING_STAGES])
  stage!: (typeof STITCHING_STAGES)[number];

  @ApiPropertyOptional({ description: 'Required when sending a job back a stage' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AssignJobDto {
  @ApiPropertyOptional({ description: 'Null unassigns the job' })
  @IsOptional()
  @IsString()
  tailorId?: string | null;
}

export class QuoteStitchingDto {
  @ApiProperty({ description: 'Fee in paisa' })
  @IsInt()
  @Min(0)
  fee!: number;
}

export class ChangeStitchingOrderStatusDto {
  @ApiProperty({ enum: STITCHING_ORDER_STATUSES })
  @IsIn([...STITCHING_ORDER_STATUSES])
  status!: (typeof STITCHING_ORDER_STATUSES)[number];
}

export class FabricReceivedDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
