import { parseDuration } from './auth.service';

describe('parseDuration', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['24h', 86_400_000],
    ['30d', 2_592_000_000],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseDuration(' 15m ')).toBe(900_000);
  });

  it('throws on a form it cannot parse, rather than silently returning NaN', () => {
    // A silent NaN here would create refresh tokens that expire at the epoch.
    expect(() => parseDuration('15 minutes')).toThrow(/Cannot parse duration/);
    expect(() => parseDuration('')).toThrow();
    expect(() => parseDuration('m15')).toThrow();
  });
});
