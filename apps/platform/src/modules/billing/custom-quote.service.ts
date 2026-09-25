import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import type { PlatformCustomQuote } from '../../core/prisma/client';

export interface RequestQuoteInput {
  tenantId: string;
  planId: string;
  listPriceMinor: number;
  quotedPriceMinor: number;
  requestedByOpsClientId: string;
}

/**
 * WO-50.4 — the custom-quote/discount-approval flow. A discount above
 * `PLATFORM_QUOTE_DISCOUNT_APPROVAL_THRESHOLD_PCT` needs a second
 * approver; the same ops principal can never both request and approve
 * their own discount (doc 50's own "toxic pair").
 */
@Injectable()
export class CustomQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async requestQuote(input: RequestQuoteInput): Promise<PlatformCustomQuote> {
    const [tenant, plan] = await Promise.all([
      this.prisma.platformTenant.findUnique({ where: { id: input.tenantId } }),
      this.prisma.platformPlan.findUnique({ where: { id: input.planId } }),
    ]);
    if (!tenant) throw new NotFoundException(`No tenant with id ${input.tenantId}`);
    if (!plan) throw new NotFoundException(`No plan with id ${input.planId}`);
    if (input.listPriceMinor <= 0) throw new BadRequestException('listPriceMinor must be positive.');
    if (input.quotedPriceMinor < 0 || input.quotedPriceMinor > input.listPriceMinor) {
      throw new BadRequestException('quotedPriceMinor must be between 0 and listPriceMinor.');
    }

    const discountPct = ((input.listPriceMinor - input.quotedPriceMinor) / input.listPriceMinor) * 100;
    const threshold = this.config.get('PLATFORM_QUOTE_DISCOUNT_APPROVAL_THRESHOLD_PCT');
    const requiresApproval = discountPct > threshold;

    return this.prisma.platformCustomQuote.create({
      data: {
        tenantId: input.tenantId,
        planId: input.planId,
        listPriceMinor: input.listPriceMinor,
        quotedPriceMinor: input.quotedPriceMinor,
        discountPct,
        requiresApproval,
        requestedByOpsClientId: input.requestedByOpsClientId,
        status: requiresApproval ? 'PENDING' : 'APPROVED',
        approvedAt: requiresApproval ? null : new Date(),
      },
    });
  }

  async approve(id: string, approvedByOpsClientId: string): Promise<PlatformCustomQuote> {
    const quote = await this.getById(id);
    if (quote.status !== 'PENDING') throw new BadRequestException(`Quote ${id} is not pending approval.`);
    if (quote.requestedByOpsClientId === approvedByOpsClientId) {
      throw new ForbiddenException('The ops client who requested a quote cannot also approve it.');
    }

    return this.prisma.platformCustomQuote.update({
      where: { id },
      data: { status: 'APPROVED', approvedByOpsClientId, approvedAt: new Date() },
    });
  }

  async reject(id: string, reason: string): Promise<PlatformCustomQuote> {
    const quote = await this.getById(id);
    if (quote.status !== 'PENDING') throw new BadRequestException(`Quote ${id} is not pending approval.`);
    return this.prisma.platformCustomQuote.update({
      where: { id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    });
  }

  async getById(id: string): Promise<PlatformCustomQuote> {
    const quote = await this.prisma.platformCustomQuote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException(`No custom quote with id ${id}`);
    return quote;
  }

  async listForTenant(tenantId: string): Promise<PlatformCustomQuote[]> {
    return this.prisma.platformCustomQuote.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async listPending(): Promise<PlatformCustomQuote[]> {
    return this.prisma.platformCustomQuote.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  }
}
