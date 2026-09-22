import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** RETAIL-ERP.md R9/R13 — the three switches a brand sets for its own branches, ADR-021/ADR-022. */
export class UpdateBrandPolicyDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowBranchProductCreation?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowBranchLocalPurchasing?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowInterBranchTransfers?: boolean;
}
