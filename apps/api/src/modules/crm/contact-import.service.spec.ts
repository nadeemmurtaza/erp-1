import { ContactImportService } from './contact-import.service';

/**
 * admin-platform/72-fragmented-tool-consolidation-import.md WO-72.1/72.3 —
 * the phone-then-email dedup this service delegates to `CrmService`, and
 * the dry-run preview's own "writes nothing" guarantee.
 */
describe('ContactImportService', () => {
  function makeService(overrides: { existingContact?: unknown } = {}) {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue(overrides.existingContact ?? null),
        update: jest.fn(),
      },
    };
    const audit = { record: jest.fn() };
    const crm = {
      upsertContact: jest.fn().mockResolvedValue({ id: 'c1' }),
      tagContact: jest.fn(),
    };
    const service = new ContactImportService(prisma as any, audit as any, crm as any);
    return { service, prisma, audit, crm };
  }

  const header = 'name,phone,email,city,notes,tags\n';

  it('creates a new contact for a phone the book has never seen', async () => {
    const { service, crm, audit } = makeService();
    const csv = header + 'Ayesha Khan,03001234567,,Lahore,,\n';

    const summary = await service.import('actor1', csv);

    expect(summary.created).toBe(1);
    expect(summary.results[0]!.action).toBe('created');
    expect(crm.upsertContact).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('reports updated, not a duplicate, when the phone already matches a contact', async () => {
    const { service, crm } = makeService({ existingContact: { id: 'c1' } });
    const csv = header + 'Ayesha Khan,03001234567,,Lahore,,\n';

    const summary = await service.import('actor1', csv);

    expect(summary.updated).toBe(1);
    expect(summary.created).toBe(0);
    expect(crm.upsertContact).toHaveBeenCalledTimes(1);
  });

  it('skips a row with neither phone nor email', async () => {
    const { service, crm } = makeService();
    const csv = header + 'No Contact Info,,,,,\n';

    const summary = await service.import('actor1', csv);

    expect(summary.skipped).toBe(1);
    expect(summary.results[0]!.message).toMatch(/phone or email/);
    expect(crm.upsertContact).not.toHaveBeenCalled();
  });

  it('writes nothing when dryRun is true', async () => {
    const { service, crm, prisma, audit } = makeService();
    const csv = header + 'Ayesha Khan,03001234567,,Lahore,Prefers WhatsApp,vip\n';

    const summary = await service.import('actor1', csv, { dryRun: true });

    expect(summary.created).toBe(1);
    expect(crm.upsertContact).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a file over the shared row cap before processing any row', async () => {
    const { service } = makeService();
    const rows = Array.from({ length: 5001 }, (_, i) => `Contact ${i},0300000${String(i).padStart(4, '0')},,,,`).join('\n');
    const csv = header + rows + '\n';

    await expect(service.import('actor1', csv)).rejects.toThrow(/at most 5000 rows/);
  });
});
