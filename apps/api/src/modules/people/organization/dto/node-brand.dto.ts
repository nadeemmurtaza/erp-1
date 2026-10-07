import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** WO-23.3c/e — which brand this registered node belongs to. Omit to clear it. */
export class SetNodeBrandDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  retailBrandId?: string;
}
