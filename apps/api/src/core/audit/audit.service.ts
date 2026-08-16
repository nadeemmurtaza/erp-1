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
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `failed to write audit entry ${entry.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
