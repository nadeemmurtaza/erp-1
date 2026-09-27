import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';

/**
 * architecture-patterns/157-client-request-idempotency-keys.md's own
 * acceptance criterion #1, proven against the real database rather than a
 * mock: two truly concurrent inserts for the identical (scope, key) let
 * exactly one through — the `@@unique([scope, key])` constraint is the
 * actual race guard `IdempotencyInterceptor` relies on.
 */
describe('IdempotencyKey — @@unique([scope, key]) race guard', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ providers: [PrismaService] }).compile();
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { scope: 'test.race-guard' } });
  });

  it('lets exactly one of two concurrent creates for the same key succeed', async () => {
    const attempt = () =>
      prisma.idempotencyKey.create({
        data: { scope: 'test.race-guard', key: 'concurrent-key-1', requestHash: 'h', status: 'IN_PROGRESS' },
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rows = await prisma.idempotencyKey.findMany({ where: { scope: 'test.race-guard', key: 'concurrent-key-1' } });
    expect(rows).toHaveLength(1);
  });
});
