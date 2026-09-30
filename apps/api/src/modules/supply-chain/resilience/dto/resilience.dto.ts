import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfigureCircuitDto {
  @ApiPropertyOptional({ description: 'Consecutive failures before the circuit opens. Default 5.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  failureThreshold?: number;

  @ApiPropertyOptional({ description: 'How long the circuit stays OPEN before a HALF_OPEN trial call, in milliseconds. Default 30000.' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  cooldownMs?: number;
}

export class SimulatedCallOutcomeDto {
  /** ISO timestamp. */
  occurredAt!: string;

  @IsBoolean()
  succeeded!: boolean;
}

/**
 * Doc 38's own "Dry run before live" scope-lens. `history` is supplied by
 * the caller because no live call-outcome log for `AiProvider`/
 * `PaymentProvider`/`VectorStore` exists yet (`CircuitBreakerService
 * .simulate()`'s own doc comment) — this DTO is ready for the day a real
 * log feeds it automatically, without changing its shape.
 */
export class SimulateCircuitDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulatedCallOutcomeDto)
  history!: SimulatedCallOutcomeDto[];

  @IsInt()
  @Min(1)
  failureThreshold!: number;

  @IsInt()
  @Min(1000)
  cooldownMs!: number;
}
