import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { PARTY_ROLE_NAMES } from './party-role.const';

export class CreatePartyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsIn(PARTY_ROLE_NAMES)
  role!: (typeof PARTY_ROLE_NAMES)[number];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
