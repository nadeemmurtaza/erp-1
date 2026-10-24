import { PrismaClient } from '../src/generated/prisma';

/**
 * One-shot backfill: creates the permanent Party profile (parties.prisma)
 * for every pre-existing Supplier row that doesn't have one yet, and links
 * it via Supplier.partyId. Every Supplier created from here on gets its
 * Party transactionally (PurchasingService.create()) — this script only
 * ever needs to run once, for rows that predate that change.
 *
 * Additive and idempotent: only touches Supplier rows where partyId is
 * still null, and dedupes against an existing Party by phone before
 * creating a new one (same matching PartiesService.dedupeCandidate() uses),
 * so re-running it is a no-op once every Supplier is linked.
 */
export async function backfillParties(
  prisma: PrismaClient,
): Promise<{ suppliersLinked: number; partiesCreated: number }> {
  const suppliers = await prisma.supplier.findMany({ where: { partyId: null } });

  let suppliersLinked = 0;
  let partiesCreated = 0;

  for (const supplier of suppliers) {
    const existingParty = supplier.phone
      ? await prisma.party.findFirst({ where: { phone: supplier.phone } })
      : null;

    const party =
      existingParty ??
      (await prisma.party.create({
        data: {
          name: supplier.name,
          contactName: supplier.contactName,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          city: supplier.city,
          isActive: supplier.isActive,
        },
      }));

    if (!existingParty) partiesCreated += 1;

    await prisma.partyRoleAssignment.upsert({
      where: { partyId_role: { partyId: party.id, role: 'SUPPLIER' } },
      create: { partyId: party.id, role: 'SUPPLIER' },
      update: {},
    });

    await prisma.supplier.update({ where: { id: supplier.id }, data: { partyId: party.id } });
    suppliersLinked += 1;
  }

  return { suppliersLinked, partiesCreated };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillParties(prisma)
    .then((result) => {
      console.warn(`Linked ${result.suppliersLinked} supplier(s) to a Party (${result.partiesCreated} newly created).`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
