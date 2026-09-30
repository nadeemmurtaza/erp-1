import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class AddCrossSellDto {
  @ApiProperty({ description: 'The product to add as a manual cross-sell / "complete the look" pairing.' })
  @IsString()
  @IsNotEmpty()
  relatedProductId!: string;
}

export class ReorderCrossSellsDto {
  @ApiPropertyOptional({ type: [String], description: 'relatedProductId values, in the order they should display — MANUAL rows only.' })
  @IsArray()
  @IsString({ each: true })
  relatedProductIds!: string[];
}
