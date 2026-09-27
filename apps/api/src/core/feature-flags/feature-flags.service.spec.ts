import { FeatureFlagsService } from './feature-flags.service';

function makePrisma(row: { rolloutPercent: number; enabledOrgIds: string[]; killSwitch: boolean } | null) {
  return {
    featureFlag: {
      findUnique: jest.fn().mockResolvedValue(row),
    },
  } as any;
}

describe('FeatureFlagsService — WO-37.2', () => {
  it('fails closed to false for a key with no FeatureFlag row', async () => {
    const service = new FeatureFlagsService(makePrisma(null));
    await expect(service.isEnabled('no.such.flag', 'org-1')).resolves.toBe(false);
  });

  it('killSwitch forces off regardless of rollout percentage or allowlist', async () => {
    const service = new FeatureFlagsService(
      makePrisma({ rolloutPercent: 100, enabledOrgIds: ['org-1'], killSwitch: true }),
    );
    await expect(service.isEnabled('flag', 'org-1')).resolves.toBe(false);
  });

  it('enabledOrgIds forces on regardless of rolloutPercent', async () => {
    const service = new FeatureFlagsService(
      makePrisma({ rolloutPercent: 0, enabledOrgIds: ['org-1'], killSwitch: false }),
    );
    await expect(service.isEnabled('flag', 'org-1')).resolves.toBe(true);
    await expect(service.isEnabled('flag', 'org-2')).resolves.toBe(false);
  });

  it('rolloutPercent 0 is off for every organization not on the allowlist', async () => {
    const service = new FeatureFlagsService(
      makePrisma({ rolloutPercent: 0, enabledOrgIds: [], killSwitch: false }),
    );
    await expect(service.isEnabled('flag', 'org-1')).resolves.toBe(false);
  });

  it('rolloutPercent 100 is on for every organization', async () => {
    const service = new FeatureFlagsService(
      makePrisma({ rolloutPercent: 100, enabledOrgIds: [], killSwitch: false }),
    );
    await expect(service.isEnabled('flag', 'org-1')).resolves.toBe(true);
    await expect(service.isEnabled('flag', 'org-2')).resolves.toBe(true);
  });

  it('a rollout percentage between 0 and 100 is deterministic per (key, organizationId) — never re-randomized', async () => {
    const service = new FeatureFlagsService(
      makePrisma({ rolloutPercent: 50, enabledOrgIds: [], killSwitch: false }),
    );
    const first = await service.isEnabled('flag', 'org-1');
    const second = await service.isEnabled('flag', 'org-1');
    const third = await service.isEnabled('flag', 'org-1');
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('a rollout percentage with no organizationId is off (no bucket to place it in)', async () => {
    const service = new FeatureFlagsService(
      makePrisma({ rolloutPercent: 50, enabledOrgIds: [], killSwitch: false }),
    );
    await expect(service.isEnabled('flag', null)).resolves.toBe(false);
  });

  it('caches a lookup for the TTL window — a second call within it does not hit the database again', async () => {
    const prisma = makePrisma({ rolloutPercent: 100, enabledOrgIds: [], killSwitch: false });
    const service = new FeatureFlagsService(prisma);

    await service.isEnabled('flag', 'org-1');
    await service.isEnabled('flag', 'org-1');

    expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces the very next lookup back to the database — killSwitch takes effect on this process immediately', async () => {
    const prisma = makePrisma({ rolloutPercent: 100, enabledOrgIds: [], killSwitch: false });
    const service = new FeatureFlagsService(prisma);

    await service.isEnabled('flag', 'org-1');
    service.invalidate('flag');
    await service.isEnabled('flag', 'org-1');

    expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(2);
  });

  it('a lookup failure fails closed to false rather than throwing', async () => {
    const prisma = {
      featureFlag: { findUnique: jest.fn().mockRejectedValue(new Error('connection lost')) },
    } as any;
    const service = new FeatureFlagsService(prisma);

    await expect(service.isEnabled('flag', 'org-1')).resolves.toBe(false);
  });
});
