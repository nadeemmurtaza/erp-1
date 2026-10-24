import { BRAND } from './brand';
import { concentricRadius, radiusPx } from './theme-radii';

describe('concentricRadius (CRD-5)', () => {
  it('is the outer corner minus the inset', () => {
    expect(concentricRadius(24, 8)).toBe(16);
    expect(concentricRadius(24, 0)).toBe(24);
  });

  it('never goes negative: an inset past the outer corner is square', () => {
    expect(concentricRadius(3, 8)).toBe(0);
    expect(concentricRadius(8, 8)).toBe(0);
  });

  it('treats a negative inset as none, so a bad input cannot enlarge the inner corner', () => {
    expect(concentricRadius(24, -8)).toBe(24);
  });

  it('gives the house shape a square inset today', () => {
    expect(concentricRadius(BRAND.theme.radii.lg, 8)).toBe(0);
  });

  it('formats for the CSS side', () => {
    expect(radiusPx(concentricRadius(24, 8))).toBe('16px');
  });
});

describe('safeguards (DNG-1, DNG-6)', () => {
  const { holdToConfirmMs, deletionCooldownDays } = BRAND.safeguards;

  it('holds long enough that a stray press cannot fire it, and short enough to mean it', () => {
    // A phone long-press is about 500 ms: the hold must outlast it, and a person who means it must not wait past two seconds.
    expect(holdToConfirmMs).toBe(1000);
    expect(holdToConfirmMs).toBeGreaterThan(500);
    expect(holdToConfirmMs).toBeLessThanOrEqual(2000);
  });

  it('keeps a removed thing for two weeks', () => {
    expect(deletionCooldownDays).toBe(14);
    expect(Number.isInteger(deletionCooldownDays)).toBe(true);
  });
});

describe('feedback (CPY-2, CPY-5, SUC-3)', () => {
  const { copiedHoldMs, copyFailedHoldMs, toastMs } = BRAND.feedback;

  it('leaves a toast after four seconds, the same as a sentence-length copy failure', () => {
    expect(toastMs).toBe(4000);
    expect(toastMs).toBe(copyFailedHoldMs);
  });

  it('holds the check for about two seconds', () => {
    expect(copiedHoldMs).toBe(2000);
  });

  it('holds a failure longer than a success, because it carries a sentence to act on', () => {
    expect(copyFailedHoldMs).toBe(4000);
    expect(copyFailedHoldMs).toBeGreaterThan(copiedHoldMs);
  });

  it('holds the check longer than the fade back, or the check would never be seen', () => {
    expect(copiedHoldMs).toBeGreaterThan(BRAND.theme.motion.duration.normal * 4);
  });
});
