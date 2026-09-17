import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUrl, IsOptional } from 'class-validator';

export const TRADING_PARTNER_KINDS = ['SUPPLIER', 'CUSTOMER', 'BOTH'] as const;
export type TradingPartnerKind = (typeof TRADING_PARTNER_KINDS)[number];

export class CreateTradingPartnerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: TRADING_PARTNER_KINDS })
  @IsIn(TRADING_PARTNER_KINDS)
  kind!: TradingPartnerKind;

  @ApiPropertyOptional({ description: "Their API, for documents WE send them (WO-18.3). Omit if they only push to us." })
  @IsOptional()
  @IsUrl({ require_tld: false })
  outboundBaseUrl?: string;
}

export class UpdateTradingPartnerDto extends PartialType(CreateTradingPartnerDto) {
  @ApiPropertyOptional({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED'] })
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}

export class SetOutboundApiKeyDto {
  @ApiProperty({ description: 'The credential THEY issued us, for calling their outboundBaseUrl.' })
  @IsString()
  @IsNotEmpty()
  apiKey!: string;
}
