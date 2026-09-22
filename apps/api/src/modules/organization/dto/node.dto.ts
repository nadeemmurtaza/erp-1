import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class RegisterNodeDto {
  @ApiProperty({ description: "The child deployment's own NODE_ID." })
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @ApiProperty({ description: 'Display name for the admin drill-down — "Lahore — Gulberg", not a slug.' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  url!: string;

  /** WO-23.3c/e — which brand this child belongs to. Omit to leave it unset; a policy check against this node then fails closed until it is set. */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  retailBrandId?: string;
}
