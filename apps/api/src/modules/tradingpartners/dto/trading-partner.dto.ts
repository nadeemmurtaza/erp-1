import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, IsUrl, IsOptional } from 'class-validator';

export const TRADING_PARTNER_KINDS = ['SUPPLIER', 'CUSTOMER', 'BOTH'] as const;
export type TradingPartnerKind = (typeof TRADING_PARTNER_KINDS)[number];

export const PARTY_ROLE_NAMES = ['SUPPLIER', 'MANUFACTURER', 'DISTRIBUTOR', 'RETAILER'] as const;
export type PartyRoleNameDto = (typeof PARTY_ROLE_NAMES)[number];

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

  @ApiPropertyOptional({ description: 'Where to email the first-connection invite, if we have it yet.' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
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

export class AcceptConnectionDto {
  @ApiProperty({ description: 'The raw invite token from the link we sent — never stored, checked by hash.' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ enum: PARTY_ROLE_NAMES, description: 'Which role they are accepting the connection as.' })
  @IsIn(PARTY_ROLE_NAMES)
  role!: PartyRoleNameDto;
}
