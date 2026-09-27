import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import type { PosOrderType } from '../../../core/prisma/client';

// pos-hardware/31 §3 — the same local-tuple `IsEnum` convention `pos-sale.dto.ts`
// already uses for `QuantitySource`.
const POS_ORDER_TYPES = ['COUNTER', 'TAB', 'TABLE'] as const satisfies readonly PosOrderType[];

/**
 * pos-hardware/31 WO-31.3 — park a sale in progress. `basketSnapshot` is the
 * till's own basket shape (pos-core), stored opaquely and replayed by the
 * caller on retrieve — this service never interprets it.
 */
export class ParkSaleDto {
  @ApiProperty({ enum: POS_ORDER_TYPES })
  @IsEnum(POS_ORDER_TYPES)
  orderType!: PosOrderType;

  @ApiProperty({ description: '"Table 4", "Tab — Ahmed" — free text a server recognizes.' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ description: "The till's own basket snapshot, stored opaquely." })
  basketSnapshot!: unknown;
}
