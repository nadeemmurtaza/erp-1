import { BRAND } from './brand';
import { spaceRem, tailwindSpacingKey } from './theme-space';

describe('spacing and size tokens', () => {
  const { space, size } = BRAND.theme;

  it('sits on Tailwind’s 4px grid, so web needs no new utilities', () => {
    for (const px of Object.values(space)) expect(px % 2).toBe(0);
    // 2px is the one half-step, and it is Tailwind's own `0.5`.
    expect(tailwindSpacingKey(space[1])).toBe('0.5');
    expect(tailwindSpacingKey(space[3])).toBe('2');
    expect(tailwindSpacingKey(space[5])).toBe('4');
    expect(tailwindSpacingKey(space[9])).toBe('16');
  });

  it('is strictly increasing', () => {
    const steps = Object.values(space);
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
  });

  it('converts to rem against a 16px root', () => {
    expect(spaceRem(8)).toBe('0.5rem');
    expect(spaceRem(44)).toBe('2.75rem');
  });

  it('orders control heights, and keeps the touch floors at 44 and 48 (ACT-1, ACC-4)', () => {
    expect(size.control.sm).toBeLessThan(size.control.md);
    expect(size.control.md).toBeLessThan(size.control.lg);
    // FRM-2: the field of a sign-in form is 56, and it stays above the touch floor.
    expect(size.control.xl).toBe(56);
    expect(size.control.lg).toBeLessThan(size.control.xl);
    expect(size.control.xl).toBeGreaterThan(size.touch.pos);
    expect(size.touch.min).toBe(44);
    expect(size.touch.pos).toBe(48);
    expect(size.touch.pos).toBeGreaterThan(size.touch.min);
  });
});

describe('layers', () => {
  it('orders the stack the way the elevation names read', () => {
    const l = BRAND.theme.layers;
    const order = [l.base, l.raised, l.sticky, l.dropdown, l.overlay, l.modal, l.toast, l.debug];
    for (let i = 1; i < order.length; i += 1) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
  });

  it('keeps local stacking below every page-level layer', () => {
    expect(BRAND.theme.layers.raised).toBeLessThan(BRAND.theme.layers.sticky);
  });
});

describe('elevation', () => {
  it('has the same four steps in both themes', () => {
    expect(Object.keys(BRAND.theme.elevation.dark)).toEqual(Object.keys(BRAND.theme.elevation.light));
  });

  it('is never a border-and-shadow hybrid: no step draws a zero-blur spread ring', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const value of Object.values(BRAND.theme.elevation[theme])) {
        expect(value).not.toMatch(/0 0 0 \d+px/);
      }
    }
  });
});

describe('motion', () => {
  const { duration, easing } = BRAND.theme.motion;

  it('orders the durations instant < fast < normal < slow < sweep', () => {
    const order = [duration.instant, duration.fast, duration.normal, duration.slow, duration.sweep];
    for (let i = 1; i < order.length; i += 1) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
  });

  it('keeps every interaction response inside the one-frame-per-step budget of the UI range (≤ 420ms)', () => {
    for (const ms of Object.values(duration)) expect(ms).toBeLessThanOrEqual(420);
  });

  it('keeps the language\'s other tokens inside the ranges the rules allow', () => {
    const { distance, scale, speed, stagger } = BRAND.theme.motion;
    // A press is a small idea (chapter 05): it moves a couple of px and compresses a couple of percent.
    expect(distance.micro).toBe(2);
    expect(distance.nudge).toBeLessThan(distance.small);
    expect(scale.press).toBeGreaterThanOrEqual(0.95);
    expect(scale.press).toBeLessThan(1);
    expect(scale.arrive).toBeGreaterThanOrEqual(0.9);
    expect(scale.arrive).toBeLessThan(1);
    expect(scale.pop).toBeGreaterThan(0);
    expect(scale.pop).toBeLessThan(scale.arrive);
    // Reading speed (px per second): between the two reference reels that scrolled text (23 and 80), and a 240px overflow is one pass of about five seconds.
    expect(speed.read).toBeGreaterThanOrEqual(20);
    expect(speed.read).toBeLessThanOrEqual(100);
    // MOT-6: the whole cascade finishes inside one `slow` step, however many children there are.
    expect(stagger.step * stagger.steps).toBeLessThanOrEqual(duration.slow);
    // CRD-6: the fine step is for many small peers; it is finer than the step and the cap still holds.
    expect(stagger.fine).toBe(40);
    expect(stagger.fine).toBeLessThan(stagger.step);
    expect(stagger.fine * stagger.steps).toBeLessThanOrEqual(duration.slow);
    // CRD-6: a card lifts by more than a press sinks and by less than a small movement.
    expect(distance.lift).toBeGreaterThan(distance.micro);
    expect(distance.lift).toBeLessThan(distance.small);
  });

  it('settles with a strong ease-out that never overshoots', () => {
    const [, y1, , y2] = easing.settle;
    expect(y1).toBeLessThanOrEqual(1);
    expect(y2).toBeLessThanOrEqual(1);
  });

  it('gives every easing four control points with x in [0, 1]', () => {
    for (const points of Object.values(easing)) {
      expect(points).toHaveLength(4);
      expect(points[0]).toBeGreaterThanOrEqual(0);
      expect(points[0]).toBeLessThanOrEqual(1);
      expect(points[2]).toBeGreaterThanOrEqual(0);
      expect(points[2]).toBeLessThanOrEqual(1);
    }
  });
});
