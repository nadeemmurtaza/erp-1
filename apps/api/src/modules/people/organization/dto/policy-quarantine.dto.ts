import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** WO-23.3c/e — the reviewer's own note. "Quarantined for review" with no record of what was decided is not a review. */
export class ResolvePolicyQuarantineDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
