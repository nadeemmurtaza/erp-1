import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const ADMIN_SCOPE_LEVELS = ['ORG', 'BRAND', 'BRANCH'] as const;

/**
 * What makes someone a super admin, a brand admin, or a branch admin
 * (RETAIL-ERP.md R10, WO-18.6) — never a role, only this row. Shape
 * validated again in OrganizationService.assertScopeShape(): a request
 * body can lie about which fields it sent, class-validator's `@IsOptional`
 * only proves the ones present are strings, not that the combination makes
 * sense for the chosen level.
 */
export class GrantScopeDto {
  @ApiProperty({ description: 'The user this grant applies to.' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: ADMIN_SCOPE_LEVELS })
  @IsEnum(ADMIN_SCOPE_LEVELS)
  level!: (typeof ADMIN_SCOPE_LEVELS)[number];

  @ApiPropertyOptional({ description: 'Required for BRAND and BRANCH; must be absent for ORG.' })
  @IsOptional()
  @IsString()
  retailBrandId?: string;

  @ApiPropertyOptional({ description: 'Required for BRANCH only.' })
  @IsOptional()
  @IsString()
  branchNodeId?: string;
}
