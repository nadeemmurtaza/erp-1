import { RateLimitAuditService, type RateLimitRefusal } from './rate-limit-audit.service';

describe('RateLimitAuditService — auth.rate_limited, one row per throttling episode (doc 206 §1.2)', () => {
  const refusal: RateLimitRefusal = {
    layer: 'account',
    route: 'POST /auth/login',
    identifierHash: 'a'.repeat(64),
    ip: '203.0.113.9',
    retryAfterSeconds: 288,
    episodeKey: 'a'.repeat(64),
    episodeMs: 300_000,
  };

  let markers: Set<string>;
  let client: { set: jest.Mock };
  let audit: { record: jest.Mock };
  let service: RateLimitAuditService;

  beforeEach(() => {
    markers = new Set();
    client = {
      set: jest.fn(async (key: string) => {
        if (markers.has(key)) return null;
        markers.add(key);
        return 'OK';
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new RateLimitAuditService(audit as any, { client: () => client } as any);
  });

  it('records the first refusal of an episode: hashed identifier, source IP, which layer and route — no password, no plaintext', async () => {
    await service.recordRefusal(refusal);

    expect(audit.record).toHaveBeenCalledWith({
      actorId: null,
      action: 'auth.rate_limited',
      entity: 'AuthIdentifier',
      entityId: 'a'.repeat(64),
      data: { layer: 'account', route: 'POST /auth/login', retryAfterSeconds: 288 },
      ip: '203.0.113.9',
    });
  });

  it('a flood inside one episode writes one row, not one per refused request', async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await service.recordRefusal(refusal);
    }

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith(`auth:rate-limited-audit:account:${'a'.repeat(64)}`, '1', 'PX', 300_000, 'NX');
  });

  it('the two layers, and two identifiers, are separate episodes', async () => {
    await service.recordRefusal(refusal);
    await service.recordRefusal({ ...refusal, layer: 'ip', episodeKey: 'throttler-key', episodeMs: 60_000 });
    await service.recordRefusal({ ...refusal, identifierHash: 'b'.repeat(64), episodeKey: 'b'.repeat(64) });

    expect(audit.record).toHaveBeenCalledTimes(3);
  });

  it('records anyway when the episode marker cannot be written — a lost signal is worse than a duplicate row', async () => {
    client.set.mockRejectedValue(new Error('Command timed out'));

    await service.recordRefusal(refusal);

    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('keeps an episode at least a second long, even when the block is about to lift', async () => {
    await service.recordRefusal({ ...refusal, episodeMs: 0 });

    expect(client.set).toHaveBeenCalledWith(expect.any(String), '1', 'PX', 1_000, 'NX');
  });
});
