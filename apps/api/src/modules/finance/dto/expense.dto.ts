import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

const EXPENSE_RECURRENCES = ['NONE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
const SCOPE_LEVELS = ['ORG', 'BRAND', 'BRANCH'] as const;

export class CreateExpenseDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiPropertyOptional({ description: 'Paisa — an integer, never a float.' })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ default: 'PKR' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ description: 'The date the cost belongs to, not when it was entered.' })
  @IsISO8601()
  incurredAt!: string;

  @ApiPropertyOptional({ description: 'Omit for unpaid — cash flow is the only consumer of null here.' })
  @IsISO8601()
  @IsOptional()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  payee?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({ enum: EXPENSE_RECURRENCES, default: 'NONE' })
  @IsIn(EXPENSE_RECURRENCES)
  @IsOptional()
  recurrence?: (typeof EXPENSE_RECURRENCES)[number];

  /** RETAIL-ERP.md R13/ADR-021. "Expenses are recorded at whichever tier pays them" — omit for BRAND (the default). */
  @ApiPropertyOptional({ enum: SCOPE_LEVELS, default: 'BRAND' })
  @IsIn(SCOPE_LEVELS)
  @IsOptional()
  scopeLevel?: (typeof SCOPE_LEVELS)[number];
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class ExpenseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'true = paidAt set, false = unpaid' })
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsBoolean()
  @IsOptional()
  paid?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  supplierId?: string;
}

export class ExpenseSummaryQueryDto {
  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  to?: string;
}

export class MarginQueryDto extends ExpenseSummaryQueryDto {
  @ApiPropertyOptional({ enum: ['product', 'category', 'variant'], default: 'product' })
  @IsOptional()
  @IsIn(['product', 'category', 'variant'])
  groupBy?: 'product' | 'category' | 'variant';
}

export class UnitEconomicsQueryDto extends ExpenseSummaryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
