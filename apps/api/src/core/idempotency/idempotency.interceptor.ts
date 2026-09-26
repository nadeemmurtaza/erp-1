import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, HttpStatus, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../prisma/client';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotent-write.decorator';

/**
 * architecture-patterns/157-client-request-idempotency-keys.md (WO-157.2).
 * Registered globally (`APP_INTERCEPTOR`, app.module.ts) but a no-op on any
 * route without `@IdempotentWrite(scope)` — no header required, no
 * behaviour change, exactly this document's own acceptance criterion.
 *
 * Runs after `JwtAuthGuard`/`PermissionsGuard` in Nest's own pipeline
 * (guards execute before interceptors) — a request-deduplication mechanism,
 * never a substitute for authorization.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const scope = this.reflector.getAllAndOverride<string | undefined>(IDEMPOTENCY_SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!scope) return next.handle();

    const request = ctx.switchToHttp().getRequest<Request>();
    const key = request.header('Idempotency-Key');
    if (!key) throw new BadRequestException('Idempotency-Key header is required for this request.');

    const requestHash = createHash('sha256').update(JSON.stringify(request.body ?? {})).digest('hex');

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
    if (existing) return of(this.replayOrRefuse(existing, requestHash));

    try {
      await this.prisma.idempotencyKey.create({ data: { scope, key, requestHash, status: 'IN_PROGRESS' } });
    } catch (error) {
      // The @@unique constraint is the actual race guard: two concurrent
      // requests with the same key both reach this insert, and the
      // database — not application logic — lets exactly one through. The
      // loser lands here and is told the same thing a slower findUnique()
      // would have found: this key is already being processed.
      if (isUniqueViolation(error)) {
        throw new ConflictException('This request is already being processed.');
      }
      throw error;
    }

    try {
      const result = await firstValueFrom(next.handle());
      const responseStatus = this.reflector.get<number | undefined>(HTTP_CODE_METADATA, ctx.getHandler()) ?? HttpStatus.CREATED;
      // Normalized through JSON round-tripping so a replay serves the exact
      // bytes a client would have received the first time (a Date becomes
      // the same ISO string Express's own res.json() would have sent).
      const responseBody = JSON.parse(JSON.stringify(result ?? null)) as Prisma.InputJsonValue;
      await this.prisma.idempotencyKey.update({
        where: { scope_key: { scope, key } },
        data: { status: 'COMPLETED', responseStatus, responseBody, completedAt: new Date() },
      });
      return of(result);
    } catch (error) {
      // A genuine failure (validation error, declined payment) must stay
      // retryable under the SAME key — delete the row rather than caching
      // a failure forever.
      await this.prisma.idempotencyKey.delete({ where: { scope_key: { scope, key } } }).catch(() => undefined);
      throw error;
    }
  }

  private replayOrRefuse(existing: { requestHash: string; status: string; responseBody: unknown }, requestHash: string): unknown {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException('This Idempotency-Key was already used with a different request body.');
    }
    if (existing.status === 'IN_PROGRESS') {
      throw new ConflictException('This request is already being processed.');
    }
    return existing.responseBody;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}
