import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveStockVarianceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolutionNote?: string;
}
