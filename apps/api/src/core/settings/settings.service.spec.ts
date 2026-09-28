import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';
import { DEFAULT_SETTINGS, SettingKey } from './settings.defaults';
import { SETTINGS_L1_MAX_ENTRIES, SETTINGS_L1_TTL_MS, SETTINGS_L2_TTL_MS, SettingsService } from './settings.service';

/**
 * WO-208.1: SettingsService moved onto InProcessCache with no behaviour
 * change — these pin the behaviour. Redis reads as not connected here; the
 * shared L2 and two replicas are test/settings-cache.e2e-spec.ts's.
 */
describe('SettingsService', () => {
  const T0 = 1_900_000_000_000;
  let now: number;
  let prisma: { setting: { findUnique: jest.Mock; upsert: jest.Mock; findMany: jest.Mock; createMany: jest.Mock } };
  let service: SettingsService;

  beforeEach(() => {
    now = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    // Redis not connected: each invalidation says so, which is right in production and noise here.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = {
      setting: {
        findUnique: jest.fn().mockResolvedValue({ key: 'checkout.cod_fee', value: 150 }),
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new SettingsService(prisma as any, { isReady: () => false } as unknown as RedisService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('pins doc 208\'s parameters — the L1 TTL is the 30 s the hand-rolled cache had, and the cap sits far above the closed key set', () => {
    expect(SETTINGS_L1_TTL_MS).toBe(30_000);
    expect(SETTINGS_L2_TTL_MS).toBe(300_000);
    expect(SETTINGS_L1_MAX_ENTRIES).toBe(1_000);
    expect(Object.keys(SettingKey).length).toBeLessThan(SETTINGS_L1_MAX_ENTRIES / 10);
  });

  it('reads a setting once and serves it for 30 s, then reads it again', async () => {
    expect(await service.get<number>(SettingKey.CodFee)).toBe(150);
    now = T0 + 29_999;
    expect(await service.get<number>(SettingKey.CodFee)).toBe(150);
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(1);

    prisma.setting.findUnique.mockResolvedValue({ key: 'checkout.cod_fee', value: 200 });
    now = T0 + 30_000;
    expect(await service.get<number>(SettingKey.CodFee)).toBe(200);
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(2);
  });

  it('falls back to the default when no row exists, and caches that too', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);

    expect(await service.get(SettingKey.StitchingLeadDays)).toEqual(DEFAULT_SETTINGS[SettingKey.StitchingLeadDays]);
    await service.get(SettingKey.StitchingLeadDays);
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(1);
  });

  it('caches "no row and no default" as a hit, as the old map did — undefined is boxed, not a miss', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);

    expect(await service.get('no.such.setting')).toBeUndefined();
    expect(await service.get('no.such.setting')).toBeUndefined();
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps each key\'s entry separate', async () => {
    prisma.setting.findUnique.mockImplementation(({ where }: { where: { key: string } }) =>
      Promise.resolve({ key: where.key, value: `${where.key}-value` }),
    );

    expect(await service.get('a')).toBe('a-value');
    expect(await service.get('b')).toBe('b-value');
    expect(await service.get('a')).toBe('a-value');
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(2);
  });

  it('set() writes, and this process serves the new value on its very next read', async () => {
    await service.get(SettingKey.CodFee);
    prisma.setting.findUnique.mockResolvedValue({ key: 'checkout.cod_fee', value: 250 });

    await service.set(SettingKey.CodFee, 250);

    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: SettingKey.CodFee },
      create: { key: SettingKey.CodFee, value: 250, description: undefined },
      update: { value: 250, description: undefined },
    });
    expect(await service.get(SettingKey.CodFee)).toBe(250);
  });

  it('set() leaves the other keys cached', async () => {
    await service.get('a');
    await service.get('b');

    await service.set('a', 1);
    await service.get('b');

    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(2);
  });

  it('invalidate() drops every cached key — after a bulk update', async () => {
    await service.get('a');
    await service.get('b');

    await service.invalidate();
    await service.get('a');
    await service.get('b');

    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(4);
  });

  it('a failed write drops nothing — the old value is still the stored one', async () => {
    await service.get(SettingKey.CodFee);
    prisma.setting.upsert.mockRejectedValue(new Error('connection reset'));

    await expect(service.set(SettingKey.CodFee, 999)).rejects.toThrow('connection reset');
    expect(await service.get(SettingKey.CodFee)).toBe(150);
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(1);
  });
});
