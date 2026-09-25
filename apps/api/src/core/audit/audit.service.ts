import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/client';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: unknown;
  ip?: string | null;
}

/**
 * Append-only record of who changed what. Staff edit prices, approve payments
 * and advance tailoring jobs; when a customer disputes an order, this is the
 * only way to answer "who changed it and when".
 *
 * Writing an audit entry must never fail the operation it describes, so errors
 * are logged rather than thrown.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: toRow(entry) });
    } catch (error) {
      this.logger.error(
        `failed to write audit entry ${entry.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Evidence-class audit (canonical ruling 9): written with the caller's own
   * transaction client, so the entry commits or rolls back with the act it
   * records — and a failed write fails that act rather than being logged and
   * forgotten, the opposite of `record()` above. For a change to what someone
   * may do, or to money; the class is chosen by calling this method, so it is
   * named where the call is made.
   *
   * Honest limit: `AuditLog` is not yet immutable at the database (ruling 1's
   * prerequisite migration), so this trail is transactional, not
   * tamper-evident.
   */
  async recordEvidence(tx: Prisma.TransactionClient, entries: AuditEntry | readonly AuditEntry[]): Promise<void> {
    const rows = (Array.isArray(entries) ? entries : [entries]) as readonly AuditEntry[];
    if (rows.length === 0) return;
    await tx.auditLog.createMany({ data: rows.map(toRow) });
  }
}

function toRow(entry: AuditEntry): Prisma.AuditLogCreateManyInput {
  return {
    actorId: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
    ip: entry.ip ?? null,
  };
}
