import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('PartiesService', () => {
  let service: PartiesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      party: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      partyRoleAssignment: { upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PartiesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PartiesService);
  });

  describe('get', () => {
    it('throws NotFoundException for a missing party', async () => {
      prisma.party.findUnique.mockResolvedValue(null);
      await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('dedupeCandidate', () => {
    it('returns null when neither phone nor taxId is given', async () => {
      const result = await service.dedupeCandidate({});
      expect(result).toBeNull();
      expect(prisma.party.findFirst).not.toHaveBeenCalled();
    });

    it('matches on phone OR taxId', async () => {
      await service.dedupeCandidate({ phone: '0300', taxId: 'TAX1' });
      expect(prisma.party.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ phone: '0300' }, { taxId: 'TAX1' }] },
      });
    });
  });

  describe('findOrCreateForRole', () => {
    it('creates a new Party with the given role when no candidate matches', async () => {
      prisma.party.findFirst.mockResolvedValue(null);
      prisma.party.create.mockResolvedValue({ id: 'p1', name: 'Acme' });

      const result = await service.findOrCreateForRole({ name: 'Acme', phone: '0300' }, 'SUPPLIER');

      expect(prisma.party.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Acme', roles: { create: { role: 'SUPPLIER' } } }),
        }),
      );
      expect(result).toEqual({ id: 'p1', name: 'Acme' });
    });

    it('links the role onto an existing match rather than duplicating the Party', async () => {
      prisma.party.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Acme',
        contactName: null,
        email: null,
        address: null,
        city: null,
      });
      prisma.party.update.mockResolvedValue({ id: 'p1', name: 'Acme' });

      await service.findOrCreateForRole({ name: 'Acme', phone: '0300', email: 'a@acme.test' }, 'SUPPLIER');

      expect(prisma.party.create).not.toHaveBeenCalled();
      expect(prisma.partyRoleAssignment.upsert).toHaveBeenCalledWith({
        where: { partyId_role: { partyId: 'p1', role: 'SUPPLIER' } },
        create: { partyId: 'p1', role: 'SUPPLIER' },
        update: {},
      });
      expect(prisma.party.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'a@acme.test' }) }),
      );
    });

    it('does not overwrite a field staff already corrected', async () => {
      prisma.party.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Acme',
        contactName: 'Corrected Name',
        email: null,
        address: null,
        city: null,
      });
      prisma.party.update.mockResolvedValue({});

      await service.findOrCreateForRole({ name: 'Acme', phone: '0300', contactName: 'Original Name' }, 'SUPPLIER');

      expect(prisma.party.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contactName: 'Corrected Name' }) }),
      );
    });
  });

  describe('search', () => {
    it('filters by role and free-text term, and surfaces the linked supplierId', async () => {
      prisma.party.findMany.mockResolvedValue([
        { id: 'p1', name: 'Acme', phone: '0300', city: 'Karachi', supplier: { id: 's1' } },
      ]);

      const result = await service.search('acme', 'SUPPLIER' as any);

      expect(prisma.party.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            roles: { some: { role: 'SUPPLIER' } },
            OR: expect.any(Array),
          }),
        }),
      );
      expect(result).toEqual([{ id: 'p1', name: 'Acme', phone: '0300', city: 'Karachi', supplierId: 's1' }]);
    });
  });
});
