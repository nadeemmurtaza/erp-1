import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { AuditService } from '../../../core/audit/audit.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma } from '../../../core/prisma/client';
import { checkRedirectChain } from './redirect-guard';

/**
 * WO-3.9 (03-variants-sku-seo.md) — the redirect table. A path is stored with
 * no host and no locale prefix ("/product/old-slug"); the locale segment is
 * stripped before lookup and reapplied on 301, since a slug is shared across
 * locales (Product.slug is not per-locale) — see the migration's own comment.
 */
@Injectable()
export class RedirectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.redirect.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** Public, cached lookup for the storefront's own middleware — never throws, just tells it where to go. */
  async lookup(fromPath: string): Promise<{ toPath: string; statusCode: number } | null> {
    const row = await this.prisma.redirect.findUnique({ where: { fromPath } });
    if (!row) return null;

    // Best-effort — a lost increment here would only ever under-count a hit,
    // never break the redirect itself.
    this.prisma.redirect
      .update({ where: { fromPath }, data: { hitCount: { increment: 1 } } })
      .catch(() => undefined);

    return { toPath: row.toPath, statusCode: row.statusCode };
  }

  async create(actorId: string, input: { fromPath: string; toPath: string; statusCode?: number }) {
    return this.upsert(actorId, input, false);
  }

  async delete(actorId: string, id: string): Promise<void> {
    const row = await this.prisma.redirect.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That redirect no longer exists.');

    await this.prisma.redirect.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'catalog.redirect_deleted',
      entity: 'Redirect',
      entityId: id,
      data: { fromPath: row.fromPath, toPath: row.toPath },
    });
  }

  /**
   * Creates (or rewrites, chain-guarded) a redirect for a live product or
   * category whose slug just changed. Called from inside product-admin and
   * category-admin's own update transactions — `tx` is that same open
   * transaction, so the redirect either commits with the slug change or not
   * at all.
   */
  async recordSlugChange(
    tx: Prisma.TransactionClient,
    kind: 'product' | 'category',
    oldSlug: string,
    newSlug: string,
  ): Promise<void> {
    if (oldSlug === newSlug) return;
    const fromPath = `/${kind}/${oldSlug}`;
    const toPath = `/${kind}/${newSlug}`;
    await this.upsert(null, { fromPath, toPath, isAutomatic: true }, true, tx);
  }

  /** Manual entries only, one row per line: `from_path,to_path[,status_code]`. */
  async importCsv(actorId: string, buffer: Buffer): Promise<{ created: number; skipped: Array<{ row: number; reason: string }> }> {
    const rows: Array<{ from_path: string; to_path: string; status_code?: string }> = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let created = 0;
    const skipped: Array<{ row: number; reason: string }> = [];

    for (const [index, row] of rows.entries()) {
      if (!row.from_path || !row.to_path) {
        skipped.push({ row: index + 2, reason: 'Missing from_path or to_path.' });
        continue;
      }
      try {
        await this.upsert(
          actorId,
          {
            fromPath: normalisePath(row.from_path),
            toPath: normalisePath(row.to_path),
            statusCode: row.status_code ? Number.parseInt(row.status_code, 10) : undefined,
          },
          false,
        );
        created += 1;
      } catch (cause) {
        skipped.push({ row: index + 2, reason: cause instanceof Error ? cause.message : 'Could not import this row.' });
      }
    }

    return { created, skipped };
  }

  private async upsert(
    actorId: string | null,
    input: { fromPath: string; toPath: string; statusCode?: number; isAutomatic?: boolean },
    isAutomatic: boolean,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const fromPath = normalisePath(input.fromPath);
    const toPath = normalisePath(input.toPath);

    const existing = await tx.redirect.findMany({ select: { fromPath: true, toPath: true } });
    const guard = checkRedirectChain(fromPath, toPath, existing);
    if (guard.refused) {
      throw new BadRequestException(guard.reason);
    }

    for (const rewrite of guard.rewrites) {
      await tx.redirect.update({ where: { fromPath: rewrite.fromPath }, data: { toPath: rewrite.toPath } });
    }

    const row = await tx.redirect.upsert({
      where: { fromPath },
      update: { toPath, ...(input.statusCode ? { statusCode: input.statusCode } : {}) },
      create: {
        fromPath,
        toPath,
        statusCode: input.statusCode ?? 301,
        isAutomatic: input.isAutomatic ?? isAutomatic,
      },
    });

    if (actorId) {
      await this.audit.record({
        actorId,
        action: 'catalog.redirect_created',
        entity: 'Redirect',
        entityId: row.id,
        data: { fromPath, toPath },
      });
    }

    return row;
  }
}

function normalisePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
