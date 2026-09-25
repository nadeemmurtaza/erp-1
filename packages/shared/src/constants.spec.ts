import { formatBytes, formatMoneyIn } from './constants';

describe('formatMoneyIn', () => {
  it('formats a minor-unit amount in an explicitly given currency, independent of BRAND.currency', () => {
    expect(formatMoneyIn(500000, 'usd')).toMatch(/5,000/);
    expect(formatMoneyIn(500000, 'usd')).toMatch(/\$/);
  });

  it('shows no decimal for a whole major-unit amount', () => {
    expect(formatMoneyIn(500000, 'usd')).not.toMatch(/\.00/);
  });

  it('shows a fractional amount when the minor units do not divide evenly', () => {
    expect(formatMoneyIn(500050, 'usd')).toMatch(/5,000\.5/);
  });
});

describe('formatBytes', () => {
  it('formats zero explicitly', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('scales through KB/MB/GB', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('accepts a bigint (a Postgres BigInt column read straight from Prisma)', () => {
    expect(formatBytes(BigInt(1024))).toBe('1 KB');
  });

  it('accepts the numeric string a BigInt serializes to over JSON (main.ts\'s own BigInt.prototype.toJSON)', () => {
    expect(formatBytes('1024')).toBe('1 KB');
  });

  it('never throws on a malformed value — returns the em dash placeholder instead', () => {
    expect(formatBytes('not-a-number')).toBe('—');
    expect(formatBytes(-5)).toBe('—');
  });
});
