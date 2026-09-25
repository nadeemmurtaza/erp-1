import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EmployeeOffboardingRegistry } from '../../core/extension-points/employee-offboarding.registry';
import { AssetsService } from './assets.service';

/**
 * WO-79.1/79.2 (hr-people-org/79-employee-asset-management.md) — real
 * PrismaService against the seeded test database, same idiom as the rest of
 * this session's service specs.
 */
describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: PrismaService;
  let offboarding: EmployeeOffboardingRegistry;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [AssetsService, PrismaService, EmployeeOffboardingRegistry],
    }).compile();

    service = module.get(AssetsService);
    prisma = module.get(PrismaService);
    offboarding = module.get(EmployeeOffboardingRegistry);
    service.onModuleInit();
  });

  afterEach(async () => {
    await prisma.assetAssignment.deleteMany({ where: { asset: { assetTag: { startsWith: 'hr-spec-' } } } });
    await prisma.asset.deleteMany({ where: { assetTag: { startsWith: 'hr-spec-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'hr-spec-' } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `hr-spec-${Date.now()}-${seq}`;
  }

  async function makeUser() {
    return prisma.user.create({ data: { email: `${uid()}@test.com`, firstName: 'hr-spec', lastName: uid() } });
  }

  async function makeAsset() {
    return service.createAsset({ assetTag: uid(), category: 'laptop', description: 'Test laptop' });
  }

  describe('createAsset', () => {
    it('refuses a duplicate assetTag', async () => {
      const asset = await makeAsset();
      await expect(service.createAsset({ assetTag: asset.assetTag, category: 'laptop', description: 'dup' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('issue — WO-79 acceptance: an already-ASSIGNED asset cannot be issued again', () => {
    it('issues an AVAILABLE asset and flips its status to ASSIGNED', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();

      const assignment = await service.issue(asset.id, holder.id, issuer.id);

      expect(assignment.userId).toBe(holder.id);
      expect(assignment.returnedAt).toBeNull();

      const updated = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      expect(updated.status).toBe('ASSIGNED');
    });

    it('refuses to issue an asset that is already ASSIGNED', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();
      const secondHolder = await makeUser();

      await service.issue(asset.id, holder.id, issuer.id);

      await expect(service.issue(asset.id, secondHolder.id, issuer.id)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a non-existent asset', async () => {
      const issuer = await makeUser();
      const holder = await makeUser();
      await expect(service.issue('does-not-exist', holder.id, issuer.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('returnAsset', () => {
    it('sets returnedAt/returnedById and flips the asset back to AVAILABLE', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();
      const assignment = await service.issue(asset.id, holder.id, issuer.id);

      const returned = await service.returnAsset(assignment.id, issuer.id, 'scratched screen');

      expect(returned.returnedAt).not.toBeNull();
      expect(returned.returnedById).toBe(issuer.id);
      expect(returned.condition).toBe('scratched screen');

      const updated = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      expect(updated.status).toBe('AVAILABLE');
    });

    it('refuses to return an assignment that was already returned', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();
      const assignment = await service.issue(asset.id, holder.id, issuer.id);
      await service.returnAsset(assignment.id, issuer.id);

      await expect(service.returnAsset(assignment.id, issuer.id)).rejects.toThrow(BadRequestException);
    });

    it('lets a returned asset be issued to someone else', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();
      const secondHolder = await makeUser();
      const assignment = await service.issue(asset.id, holder.id, issuer.id);
      await service.returnAsset(assignment.id, issuer.id);

      const reissued = await service.issue(asset.id, secondHolder.id, issuer.id);
      expect(reissued.userId).toBe(secondHolder.id);
    });
  });

  describe('writeOff', () => {
    it('marks an AVAILABLE asset LOST', async () => {
      const asset = await makeAsset();
      const actor = await makeUser();

      const written = await service.writeOff(asset.id, 'LOST', actor.id);
      expect(written.status).toBe('LOST');
    });

    it('closes the open assignment when writing off an ASSIGNED asset, so it stops blocking offboarding', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();
      await service.issue(asset.id, holder.id, issuer.id);

      await service.writeOff(asset.id, 'LOST', issuer.id);

      const unreturned = await service.unreturnedAssetsFor(holder.id);
      expect(unreturned.find((a) => a.assetId === asset.id)).toBeUndefined();
    });

    it('refuses to write off an asset that is already RETIRED or LOST', async () => {
      const asset = await makeAsset();
      const actor = await makeUser();
      await service.writeOff(asset.id, 'RETIRED', actor.id);

      await expect(service.writeOff(asset.id, 'LOST', actor.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('unreturnedAssetsFor — the offboarding gate’s own check', () => {
    it('lists only assignments with returnedAt IS NULL for that employee', async () => {
      const asset = await makeAsset();
      const returnedAsset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();

      await service.issue(asset.id, holder.id, issuer.id);
      const returnedAssignment = await service.issue(returnedAsset.id, holder.id, issuer.id);
      await service.returnAsset(returnedAssignment.id, issuer.id);

      const unreturned = await service.unreturnedAssetsFor(holder.id);

      expect(unreturned).toHaveLength(1);
      expect(unreturned[0]?.assetId).toBe(asset.id);
    });

    it('returns an empty array for an employee with nothing outstanding', async () => {
      const holder = await makeUser();
      const unreturned = await service.unreturnedAssetsFor(holder.id);
      expect(unreturned).toEqual([]);
    });
  });

  describe('EmployeeOffboardingRegistry — WO-79.4, the offboarding gate', () => {
    it('registers a handler that reports an employee’s open assets by tag/category', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();
      await service.issue(asset.id, holder.id, issuer.id);

      const reported = await offboarding.unreturnedAssetsFor(holder.id);

      expect(reported).toEqual([{ assetTag: asset.assetTag, category: asset.category }]);
    });

    it('reports nothing once the asset is returned', async () => {
      const asset = await makeAsset();
      const issuer = await makeUser();
      const holder = await makeUser();
      const assignment = await service.issue(asset.id, holder.id, issuer.id);
      await service.returnAsset(assignment.id, issuer.id);

      expect(await offboarding.unreturnedAssetsFor(holder.id)).toEqual([]);
    });
  });
});
