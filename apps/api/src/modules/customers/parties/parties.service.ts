import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma, PartyRoleName } from '../../../core/prisma/client';
import { CreatePartyDto } from './dto/party.dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

export interface FindOrCreatePartyInput {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  taxId?: string | null;
}

/**
 * The permanent counterparty profile: one canonical Party per real business,
 * searched and selected rather than re-typed into every transaction. Mirrors
 * crm's Contact dedup pattern (match by a stable identifier, fill blanks
 * without overwriting what staff already corrected) so two entries for the
 * same real business get merged instead of left to diverge.
 */
@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: string) {
    const party = await this.prisma.party.findUnique({
      where: { id },
      include: { roles: true, supplier: { select: { id: true } } },
    });
    if (!party) throw new NotFoundException('That party no longer exists.');
    return party;
  }

  /** Typeahead search backing the PartyPicker — name, phone or tax id, optionally scoped to one role. */
  async search(q: string | undefined, role?: PartyRoleName) {
    const where: Prisma.PartyWhereInput = { isActive: true };
    if (role) where.roles = { some: { role } };

    const term = q?.trim();
    if (term) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { taxId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const parties = await this.prisma.party.findMany({
      where,
      include: { supplier: { select: { id: true } } },
      orderBy: { name: 'asc' },
      take: 20,
    });

    return parties.map((party) => ({
      id: party.id,
      name: party.name,
      phone: party.phone,
      city: party.city,
      supplierId: party.supplier?.id ?? null,
    }));
  }

  async create(dto: CreatePartyDto) {
    return this.prisma.party.create({
      data: {
        name: dto.name,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        taxId: dto.taxId,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
        roles: { create: { role: dto.role } },
      },
      include: { roles: true },
    });
  }

  /** Matches an existing Party by phone or tax id — the two identifiers stable enough to dedupe on. */
  async dedupeCandidate(
    input: Pick<FindOrCreatePartyInput, 'phone' | 'taxId'>,
    tx: PrismaLike = this.prisma,
  ) {
    if (!input.phone && !input.taxId) return null;
    return tx.party.findFirst({
      where: {
        OR: [
          ...(input.phone ? [{ phone: input.phone }] : []),
          ...(input.taxId ? [{ taxId: input.taxId }] : []),
        ],
      },
    });
  }

  /**
   * Finds the Party for a counterparty, or creates one — the call
   * purchasing.service.ts makes when a Supplier is created, inside the same
   * transaction (a Supplier must never exist without its backing Party).
   * Idempotent on repeat calls with the same phone/taxId: an existing match
   * gets the role added (if it doesn't have it) rather than a duplicate Party.
   */
  async findOrCreateForRole(
    input: FindOrCreatePartyInput,
    role: PartyRoleName,
    tx: PrismaLike = this.prisma,
  ) {
    const existing = await this.dedupeCandidate(input, tx);
    if (existing) {
      await tx.partyRoleAssignment.upsert({
        where: { partyId_role: { partyId: existing.id, role } },
        create: { partyId: existing.id, role },
        update: {},
      });
      // Fill in blanks without overwriting what staff may have corrected —
      // same discipline as CrmService.upsertContact().
      return tx.party.update({
        where: { id: existing.id },
        data: {
          contactName: existing.contactName ?? input.contactName ?? null,
          email: existing.email ?? input.email ?? null,
          address: existing.address ?? input.address ?? null,
          city: existing.city ?? input.city ?? null,
        },
      });
    }

    return tx.party.create({
      data: {
        name: input.name,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email,
        address: input.address,
        city: input.city,
        taxId: input.taxId,
        roles: { create: { role } },
      },
    });
  }
}
