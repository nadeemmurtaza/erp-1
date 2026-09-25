import { Test, TestingModule } from '@nestjs/testing';
import { SeatCounterService } from './seat-counter.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();

jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    query: mockQuery,
    end: mockEnd,
  })),
}));

describe('SeatCounterService', () => {
  let credentials: any;
  let service: SeatCounterService;

  beforeEach(async () => {
    jest.clearAllMocks();
    credentials = { resolveConnectionString: jest.fn().mockResolvedValue('postgresql://x/tenant_acme') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SeatCounterService, { provide: TenantCredentialResolverService, useValue: credentials }],
    }).compile();

    service = module.get(SeatCounterService);
  });

  it('resolves the tenant connection string and runs exactly one read-only COUNT query, then closes the connection', async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: '7' }] });

    const count = await service.countBillableSeats('t1');

    expect(credentials.resolveConnectionString).toHaveBeenCalledWith('t1');
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/COUNT\(DISTINCT u\.id\)/);
    expect(mockQuery.mock.calls[0][0]).toMatch(/"isActive" = true/);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/UPDATE|INSERT|DELETE/i);
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(count).toBe(7);
  });

  it('always closes the connection even when the query fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection reset'));

    await expect(service.countBillableSeats('t1')).rejects.toThrow('connection reset');

    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('returns 0 for a tenant with no billable seats', async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });
    await expect(service.countBillableSeats('t1')).resolves.toBe(0);
  });
});
