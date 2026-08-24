import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSION_KEYS, type PermissionKey } from '@yaseen/shared';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({ enum: PERMISSION_KEYS, isArray: true })
  @IsArray()
  @IsIn(PERMISSION_KEYS, { each: true })
  permissionKeys!: PermissionKey[];
}

export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter to one entity type, e.g. "Order".' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Filter to entries by this actor.' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}
