import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { normalizeEmail, normalizePkPhone } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import type { ContactStatus, Prisma } from '../../core/prisma/client';

export interface UpsertContactInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  source?: string;
  userId?: string | null;
}

const contactInclude = {
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.ContactInclude;

/**
 * Customer records.
 *
 * A Contact is keyed on the normalised phone number, which is what collapses a
 * guest COD order, a registered account and a walk-in enquiry from the same
 * person into one customer — the whole point of the module. Everything else
 * here hangs off that.
 */
@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Finds or creates the contact for a person, matching on phone first and
   * email second.
   *
   * Safe to call repeatedly with the same person: that is what makes it usable
   * from an at-least-once event handler.
   */
  async upsertContact(input: UpsertContactInput) {
    const phone = normalizePkPhone(input.phone).e164;
    const email = normalizeEmail(input.email);

    const existing = await this.prisma.contact.findFirst({
      where: {
        OR: [
          ...(phone ? [{ phoneE164: phone }] : []),
          ...(email ? [{ email }] : []),
          ...(input.userId ? [{ userId: input.userId }] : []),
        ],
      },
    });

    if (existing) {
      // Fill in blanks without overwriting what staff may have corrected.
      return this.prisma.contact.update({
        where: { id: existing.id },
        data: {
          phoneE164: existing.phoneE164 ?? phone,
          email: existing.email ?? email,
          city: existing.city ?? input.city ?? null,
          userId: existing.userId ?? input.userId ?? null,
        },
      });
    }

    return this.prisma.contact.create({
      data: {
        name: input.name.trim() || phone || email || 'Customer',
        phoneE164: phone,
        email,
        city: input.city ?? null,
        source: input.source ?? 'storefront',
        userId: input.userId ?? null,
      },
    });
  }

  /**
   * Recomputes a contact's order rollups from their orders.
   *
   * Deliberately a recomputation rather than an increment: outbox delivery is
   * at-least-once, and an increment that runs twice would quietly inflate a
   * customer's lifetime value forever.
   */
  async refreshOrderRollups(contactId: string): Promise<void> {
    const stats = await this.prisma.order.aggregate({
      where: { contactId, status: { notIn: ['CANCELLED', 'RETURNED'] } },
      _count: { _all: true },
      _sum: { grandTotal: true },
      _min: { placedAt: true },
      _max: { placedAt: true },
    });

    const orderCount = stats._count._all;
    const lifetimeValue = stats._sum.grandTotal ?? 0;

    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        orderCount,
        lifetimeValue,
        avgOrderValue: orderCount > 0 ? Math.round(lifetimeValue / orderCount) : 0,
        firstOrderAt: stats._min.placedAt,
        lastOrderAt: stats._max.placedAt,
        // One order makes them a customer; a second makes them worth keeping.
        status: orderCount >= 2 ? 'REPEAT' : orderCount === 1 ? 'ACTIVE' : 'LEAD',
      },
    });
  }

  /** Attaches an order to its contact and refreshes the rollups. */
  async linkOrder(orderId: string, contactId: string): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { contactId },
    });
    await this.refreshOrderRollups(contactId);
  }

  /**
   * Builds contacts from orders placed before the CRM existed, and repairs any
   * whose rollups drifted. Idempotent — safe to run whenever.
   */
  async backfillFromOrders(): Promise<{
    linked: number;
    contacts: number;
    repaired: number;
  }> {
    const orders = await this.prisma.order.findMany({
      where: { contactId: null },
      select: {
        id: true,
        userId: true,
        guestName: true,
        guestPhone: true,
        guestEmail: true,
        shippingAddress: true,
      },
      orderBy: { placedAt: 'asc' },
    });

    const touched = new Set<string>();

    for (const order of orders) {
      const address = order.shippingAddress as { city?: string } | null;

      const contact = await this.upsertContact({
        name: order.guestName ?? 'Customer',
        phone: order.guestPhone,
        email: order.guestEmail,
        city: address?.city ?? null,
        userId: order.userId,
      });

      await this.prisma.order.update({
        where: { id: order.id },
        data: { contactId: contact.id },
      });
      touched.add(contact.id);
    }

    // Recompute EVERY contact, not just the ones touched above. A contact whose
    // orders were removed outright — which only happens through direct database
    // work, never through the app, where orders are cancelled rather than
    // deleted — would otherwise keep a lifetime value it no longer has. This is
    // the repair half of the job, and what makes running it a safe thing to do.
    const all = await this.prisma.contact.findMany({ select: { id: true } });
    for (const contact of all) {
      await this.refreshOrderRollups(contact.id);
    }

    if (orders.length > 0) {
      this.logger.log(
        `Backfilled ${orders.length} order(s) into ${touched.size} contact(s)`,
      );
    }
    return { linked: orders.length, contacts: touched.size, repaired: all.length };
  }

  // --- Reading -------------------------------------------------------------

  async list(query: {
    page: number;
    pageSize: number;
    skip: number;
    take: number;
    q?: string;
    status?: ContactStatus;
    tag?: string;
    city?: string;
    minOrders?: number;
  }): Promise<PaginatedResult<unknown>> {
    const where = buildContactWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        include: contactInclude,
        orderBy: [{ lastOrderAt: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return paginated(rows, total, query);
  }

  async get(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        ...contactInclude,
        orders: {
          orderBy: { placedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            number: true,
            status: true,
            grandTotal: true,
            placedAt: true,
          },
        },
        interactions: {
          orderBy: { occurredAt: 'desc' },
          take: 50,
          include: {
            actor: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        followUps: {
          orderBy: { dueAt: 'asc' },
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!contact) throw new NotFoundException('That contact no longer exists.');
    return contact;
  }

  /** The rows behind a filtered list, for CSV export. */
  async listAllMatching(query: {
    q?: string;
    status?: ContactStatus;
    tag?: string;
    city?: string;
    minOrders?: number;
  }) {
    return this.prisma.contact.findMany({
      where: buildContactWhere(query),
      include: contactInclude,
      orderBy: { lifetimeValue: 'desc' },
      // A broadcast list beyond this is a job for a marketing platform.
      take: 10_000,
    });
  }

  // --- Writing -------------------------------------------------------------

  async update(
    actorId: string,
    id: string,
    input: {
      name?: string;
      city?: string;
      email?: string;
      notes?: string;
      status?: ContactStatus;
      ownerId?: string | null;
    },
  ) {
    await this.get(id);

    const contact = await this.prisma.contact.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.city !== undefined ? { city: input.city.trim() || null } : {}),
        ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId || null } : {}),
      },
    });

    await this.audit.record({
      actorId,
      action: 'contact.updated',
      entity: 'Contact',
      entityId: id,
      data: { changed: Object.keys(input) },
    });

    return contact;
  }

  async addInteraction(
    actorId: string,
    input: {
      contactId?: string;
      leadId?: string;
      kind: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS' | 'VISIT' | 'NOTE' | 'COMPLAINT';
      body: string;
      occurredAt?: string;
    },
  ) {
    return this.prisma.interaction.create({
      data: {
        contactId: input.contactId ?? null,
        leadId: input.leadId ?? null,
        kind: input.kind,
        body: input.body.trim(),
        actorId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async addFollowUp(
    actorId: string,
    input: {
      contactId?: string;
      leadId?: string;
      note: string;
      dueAt: string;
      assigneeId?: string;
    },
  ) {
    return this.prisma.followUpTask.create({
      data: {
        contactId: input.contactId ?? null,
        leadId: input.leadId ?? null,
        note: input.note.trim(),
        dueAt: new Date(input.dueAt),
        // Whoever schedules it owns it unless they say otherwise.
        assigneeId: input.assigneeId ?? actorId,
      },
    });
  }

  async completeFollowUp(id: string) {
    return this.prisma.followUpTask.update({
      where: { id },
      data: { isDone: true, doneAt: new Date() },
    });
  }

  /** Follow-ups due today or overdue — the dashboard's nagging list. */
  async dueFollowUps(assigneeId?: string) {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    return this.prisma.followUpTask.findMany({
      where: {
        isDone: false,
        dueAt: { lte: endOfToday },
        ...(assigneeId ? { assigneeId } : {}),
      },
      orderBy: { dueAt: 'asc' },
      take: 50,
      include: {
        contact: { select: { id: true, name: true, phoneE164: true } },
        lead: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, firstName: true } },
      },
    });
  }

  // --- Tags ----------------------------------------------------------------

  async listTags() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { contacts: true } } },
    });
  }

  async tagContact(contactId: string, name: string) {
    const tag = await this.prisma.tag.upsert({
      where: { name: name.trim().toLowerCase() },
      create: { name: name.trim().toLowerCase() },
      update: {},
    });

    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      create: { contactId, tagId: tag.id },
      update: {},
    });

    return tag;
  }

  async untagContact(contactId: string, tagId: string): Promise<void> {
    await this.prisma.contactTag.deleteMany({ where: { contactId, tagId } });
  }

  // --- Leads ---------------------------------------------------------------

  async createLead(input: {
    name: string;
    phone?: string;
    email?: string;
    message?: string;
    source?: string;
  }) {
    const phone = normalizePkPhone(input.phone).e164;

    // An enquiry from an existing customer belongs on their record.
    const contact = phone || input.email
      ? await this.prisma.contact.findFirst({
          where: {
            OR: [
              ...(phone ? [{ phoneE164: phone }] : []),
              ...(input.email ? [{ email: normalizeEmail(input.email) }] : []),
            ],
          },
        })
      : null;

    return this.prisma.lead.create({
      data: {
        name: input.name.trim(),
        phone: phone ?? input.phone ?? null,
        email: normalizeEmail(input.email),
        message: input.message?.trim() || null,
        source: input.source ?? 'contact_form',
        contactId: contact?.id ?? null,
      },
    });
  }

  async listLeads(status?: string) {
    return this.prisma.lead.findMany({
      where: status ? { status: status as never } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        contact: { select: { id: true, name: true, lifetimeValue: true } },
        owner: { select: { id: true, firstName: true } },
      },
    });
  }

  async updateLead(
    actorId: string,
    id: string,
    input: {
      status?: 'NEW' | 'CONTACTED' | 'QUOTED' | 'WON' | 'LOST';
      quotedValue?: number;
      lostReason?: string;
      ownerId?: string;
    },
  ) {
    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.quotedValue !== undefined ? { quotedValue: input.quotedValue } : {}),
        ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      },
    });

    await this.audit.record({
      actorId,
      action: 'lead.updated',
      entity: 'Lead',
      entityId: id,
      data: input,
    });

    return lead;
  }
}

function buildContactWhere(query: {
  q?: string;
  status?: ContactStatus;
  tag?: string;
  city?: string;
  minOrders?: number;
}): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
  if (query.minOrders !== undefined) where.orderCount = { gte: query.minOrders };
  if (query.tag) where.tags = { some: { tag: { name: query.tag.toLowerCase() } } };

  if (query.q?.trim()) {
    const term = query.q.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { phoneE164: { contains: term.replace(/\D/g, '') } },
      { email: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}
