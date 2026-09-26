import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { PermissionKey } from '@newax/shared';

export class IssueOrgUnitGrantDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsArray()
  @IsString({ each: true })
  permissionKeys!: PermissionKey[];

  @IsIn(['READ', 'ACTING'])
  mode!: 'READ' | 'ACTING';

  @IsDateString()
  expiresAt!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countersignedByUserId?: string;
}
