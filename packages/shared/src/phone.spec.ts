import { isValidPkPhone, normalizeEmail, normalizePkPhone } from './phone';

describe('normalizePkPhone', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['0300 1234567', '+923001234567'],
    ['0300-123-4567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['92 300 1234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['(0300) 1234567', '+923001234567'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizePkPhone(input).e164).toBe(expected);
  });

  it('collapses every written form of one number to a single key', () => {
    const forms = ['03001234567', '+92 300 1234567', '0092-300-1234567', '92 300 1234 567'];
    const keys = new Set(forms.map((form) => normalizePkPhone(form).e164));
    expect(keys.size).toBe(1);
  });

  it('accepts landline numbers and marks them as not mobile', () => {
    const karachiLandline = normalizePkPhone('021 35678901');
    expect(karachiLandline.e164).toBe('+922135678901');
    expect(karachiLandline.isMobile).toBe(false);
  });

  it('marks 3xx numbers as mobile', () => {
    expect(normalizePkPhone('03451234567').isMobile).toBe(true);
  });

  it('produces a readable national form', () => {
    expect(normalizePkPhone('+923001234567').national).toBe('0300 1234567');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['0300123', 'too short'],
    ['030012345678', 'too long'],
    ['abcdefghij', 'not digits'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizePkPhone(input).e164).toBeNull();
    expect(isValidPkPhone(input)).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(normalizePkPhone(null).e164).toBeNull();
    expect(normalizePkPhone(undefined).e164).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('lower-cases and trims', () => {
    expect(normalizeEmail('  Ayesha@Example.COM ')).toBe('ayesha@example.com');
  });

  it('rejects values that are not addresses', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
