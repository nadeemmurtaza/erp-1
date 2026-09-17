import { BRAND } from '@newax/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSION_EFFECTS, PERMISSION_KEYS, type PermissionEffect, type PermissionKey } from '@newax/shared';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** The roles this screen can create/assign — never CUSTOMER, which is self-serve only. */
export const BACK_OFFICE_ROLES = ['STAFF', 'TAILOR', 'ADMIN'] as const;
export type BackOfficeRole = (typeof BACK_OFFICE_ROLES)[number];

export class CreateUserDto {
  @ApiProperty({ example: `sana@${BRAND.identity.domain}` })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiPropertyOptional({ example: '03001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'Sana' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Iqbal' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: BACK_OFFICE_ROLES })
  @IsIn(BACK_OFFICE_ROLES)
  role!: BackOfficeRole;

  /** Custom Role ids to assign on creation — separate from `role` above, which is the coarse account kind, not a permission set. A user may hold several. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Sana' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Iqbal' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: `sana@${BRAND.identity.domain}` })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email?: string;

  @ApiPropertyOptional({ example: '03001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ enum: BACK_OFFICE_ROLES })
  @IsOptional()
  @IsIn(BACK_OFFICE_ROLES)
  role?: BackOfficeRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  newPassword!: string;
}

export class PermissionOverrideDto {
  @ApiProperty({ enum: PERMISSION_KEYS })
  @IsIn(PERMISSION_KEYS)
  key!: PermissionKey;

  @ApiProperty({ enum: PERMISSION_EFFECTS })
  @IsIn(PERMISSION_EFFECTS)
  effect!: PermissionEffect;
}

export class UpdateUserPermissionsDto {
  @ApiProperty({ type: [PermissionOverrideDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  overrides!: PermissionOverrideDto[];
}
