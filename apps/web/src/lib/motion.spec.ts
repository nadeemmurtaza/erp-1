import { BRAND } from '@newax/shared';
import {
  bezierEase,
  clamp01,
  countUpValue,
  nextSwap,
  noiseGlyph,
  originOffset,
  progressFraction,
  reelParts,
  revealedCount,
  revealRun,
  REVEAL_MAX_MS,
  ringStroke,
  scrambleFrame,
  settle,
  fineStaggerDelayMs,
  staggerDelayMs,
  typedFrame,
  typedWordsFrame,
  MOTION_MS,
} from './motion';

const motion = BRAND.theme.motion;

/** A `random` that walks a fixed list, so a scramble frame is the same every run. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('bezierEase', () => {
  it('starts at 0 and ends at 1, whatever the curve', () => {
    for (const curve of Object.values(motion.easing)) {
      const ease = bezierEase(curve);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    }
  });

  it('is a straight line when the control points sit on the diagonal', () => {
    const linear = bezierEase([0, 0, 1, 1]);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(linear(t)).toBeCloseTo(t, 3);
  });

  it('matches the CSS curve at a known point (settle is front-loaded)', () => {
    // cubic-bezier(0.16, 1, 0.3, 1) is ease-out-expo-like: at 25% of the time it is far past 25% of the way.
    expect(settle(0.25)).toBeGreaterThan(0.6);
    expect(settle(0.5)).toBeGreaterThan(0.9);
  });

  it('never overshoots and never runs backwards (a business control does not bounce)', () => {
    let last = 0;
    for (let i = 1; i <= 100; i += 1) {
      const y = settle(i / 100);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
      last = y;
    }
  });
});

describe('clamp01', () => {
  it('clamps both ends and treats a non-finite value as finished', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(Number.NaN)).toBe(1);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('countUpValue', () => {
  it('starts at the origin and lands exactly on the target', () => {
    expect(countUpValue(0, 12480, 0)).toBe(0);
    expect(countUpValue(0, 12480, 1)).toBe(12480);
    expect(countUpValue(0, 12480.5, 1.5)).toBe(12480.5);
  });

  it('counts down as well as up, and between two non-zero values', () => {
    const mid = countUpValue(100, 40, 0.5);
    expect(mid).toBeLessThan(100);
    expect(mid).toBeGreaterThan(40);
    expect(countUpValue(100, 40, 1)).toBe(40);
  });

  it('never leaves the interval between the two values', () => {
    for (let i = 0; i <= 50; i += 1) {
      const v = countUpValue(10, 90, i / 50);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(90);
    }
  });
});

describe('revealedCount', () => {
  it('reveals none at 0, all at 1, and never more than there are', () => {
    expect(revealedCount(8, 0)).toBe(0);
    expect(revealedCount(8, 1)).toBe(8);
    expect(revealedCount(8, 5)).toBe(8);
    expect(revealedCount(8, 0.5)).toBe(4);
    expect(revealedCount(0, 0.5)).toBe(0);
  });
});

describe('staggerDelayMs', () => {
  it('ramps by the stagger step and stops at the cap (MOT-6)', () => {
    const { step, steps } = motion.stagger;
    expect([0, 1, 2, 3, 4, 5, 40].map(staggerDelayMs)).toEqual([
      0,
      step,
      step * 2,
      step * 3,
      step * steps,
      step * steps,
      step * steps,
    ]);
  });

  it('matches the .stagger ramp in globals.css: 0, 1, 2, 3 steps, then four for the rest', () => {
    expect(staggerDelayMs(0)).toBe(0);
    expect(staggerDelayMs(4)).toBe(motion.stagger.step * 4);
    expect(staggerDelayMs(-3)).toBe(0);
  });

  it('keeps the whole ramp inside one slow duration, so a list is never the thing the user waits for', () => {
    expect(staggerDelayMs(99)).toBeLessThanOrEqual(motion.duration.slow);
  });
});

describe('noiseGlyph', () => {
  it('keeps the kind of the character it replaces', () => {
    const r = sequence(0, 0.5, 0.99);
    for (let i = 0; i < 6; i += 1) {
      expect(noiseGlyph('7', r)).toMatch(/[0-9]/);
      expect(noiseGlyph('Q', r)).toMatch(/[A-Z]/);
      expect(noiseGlyph('q', r)).toMatch(/[a-z]/);
    }
  });

  it('leaves punctuation and spaces alone, so the layout does not reflow while it decodes', () => {
    const r = sequence(0.3);
    expect(noiseGlyph('-', r)).toBe('-');
    expect(noiseGlyph(' ', r)).toBe(' ');
    expect(noiseGlyph(',', r)).toBe(',');
  });
});

describe('scrambleFrame', () => {
  it('is all noise at 0 and the real text at 1', () => {
    const target = 'INV-2041';
    const first = scrambleFrame(target, 0, sequence(0.5));
    expect(first).toHaveLength(target.length);
    expect(first[3]).toBe('-');
    expect(scrambleFrame(target, 1, sequence(0.5))).toBe(target);
  });

  it('resolves from the front, keeping every revealed character exact', () => {
    const target = 'INV-2041';
    const frame = scrambleFrame(target, 0.5, sequence(0.7));
    expect(frame.slice(0, 4)).toBe('INV-');
    expect(frame).toHaveLength(target.length);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(scrambleFrame('اردو', 1, sequence(0.1))).toBe('اردو');
    expect(Array.from(scrambleFrame('اردو', 0.5, sequence(0.1)))).toHaveLength(4);
  });
});

describe('typedFrame', () => {
  it('shows the leading characters only', () => {
    expect(typedFrame('Hello', 0)).toBe('');
    expect(typedFrame('Hello', 0.4)).toBe('He');
    expect(typedFrame('Hello', 1)).toBe('Hello');
  });
});

describe('ringStroke', () => {
  it('draws none of the ring at 0, all of it at 1, and clamps a value over target', () => {
    const none = ringStroke(10, 0);
    const all = ringStroke(10, 1);
    expect(none.offset).toBeCloseTo(none.circumference, 6);
    expect(all.offset).toBe(0);
    expect(ringStroke(10, 1.2).offset).toBe(0);
    expect(ringStroke(10, -1).offset).toBeCloseTo(none.circumference, 6);
  });

  it('draws half the circumference at one half', () => {
    const half = ringStroke(10, 0.5);
    expect(half.offset).toBeCloseTo(half.circumference / 2, 6);
  });
});

describe('MOTION_MS', () => {
  it('reads the tokens: a figure resolving takes the sweep step, an exit takes fast', () => {
    expect(MOTION_MS.count).toBe(motion.duration.sweep);
    expect(MOTION_MS.exit).toBe(motion.duration.fast);
    expect(MOTION_MS.exit).toBeLessThan(MOTION_MS.scramble);
  });
});

describe('typedWordsFrame', () => {
  it('reveals whole words only, each with the space after it, so every frame is a prefix of the line', () => {
    const line = 'Net income is up';
    for (let i = 0; i <= 20; i += 1) {
      const frame = typedWordsFrame(line, i / 20);
      expect(line.startsWith(frame)).toBe(true);
      expect(frame === '' || /\s$|\S$/.test(frame)).toBe(true);
    }
    expect(typedWordsFrame(line, 0)).toBe('');
    expect(typedWordsFrame(line, 0.5)).toBe('Net income ');
    expect(typedWordsFrame(line, 1)).toBe(line);
  });

  it('handles an empty line and a line with leading space', () => {
    expect(typedWordsFrame('', 0.5)).toBe('');
    expect(typedWordsFrame('  two words', 0.5)).toBe('  two ');
  });
});

describe('progressFraction', () => {
  it('is value over max, held to 0–1', () => {
    expect(progressFraction(25, 100)).toBe(0.25);
    expect(progressFraction(150, 100)).toBe(1);
    expect(progressFraction(-5, 100)).toBe(0);
  });

  it('is an empty bar, not NaN, when the data is not a quantity', () => {
    expect(progressFraction(Number.NaN, 100)).toBe(0);
    expect(progressFraction(5, 0)).toBe(0);
    expect(progressFraction(5, -10)).toBe(0);
    expect(progressFraction(5, Number.NaN)).toBe(0);
    expect(progressFraction(Number.POSITIVE_INFINITY, 100)).toBe(0);
  });
});

describe('revealRun', () => {
  it('has nothing to run when the overflow is rounding or not a number', () => {
    expect(revealRun(0)).toBeNull();
    expect(revealRun(0.4)).toBeNull();
    expect(revealRun(Number.NaN)).toBeNull();
  });

  it('runs at the reading speed: the distance over px per second', () => {
    const { speed } = motion;
    const run = revealRun(speed.read * 2);
    expect(run).toEqual({ shift: speed.read * 2, durationMs: 2000 });
  });

  it('rounds the hidden width up so the last glyph clears the edge', () => {
    expect(revealRun(100.2)?.shift).toBe(101);
  });

  it('never jerks (a floor of fast) and never drags (a ceiling)', () => {
    expect(revealRun(1)?.durationMs).toBe(motion.duration.fast);
    expect(revealRun(100000)?.durationMs).toBe(REVEAL_MAX_MS);
  });
});

describe('nextSwap', () => {
  it('keeps the old text as previous while it leaves, and counts the change', () => {
    expect(nextSwap({ current: 'Pending', previous: null, changes: 0 }, 'Paid', false)).toEqual({
      current: 'Paid',
      previous: 'Pending',
      changes: 1,
    });
  });

  it('is the same state, not a new one, when the value did not change', () => {
    const state = { current: 'Paid', previous: null, changes: 0 };
    expect(nextSwap(state, 'Paid', false)).toBe(state);
  });

  it('keeps nothing leaving under reduced motion: the text just changes', () => {
    expect(nextSwap({ current: 'Pending', previous: null, changes: 0 }, 'Paid', true)).toEqual({
      current: 'Paid',
      previous: null,
      changes: 1,
    });
  });

  it('counts every change, so going back to an earlier value is still a new arrival', () => {
    const a = nextSwap({ current: 'A', previous: null, changes: 0 }, 'B', false);
    expect(nextSwap(a, 'A', false).changes).toBe(2);
  });
});

describe('originOffset', () => {
  it('is the trigger centre relative to the panel centre', () => {
    expect(originOffset({ x: 100, y: 200 }, { x: 80, y: 230 })).toEqual({ dx: 20, dy: -30 });
  });

  it('holds each axis to the largest distance step', () => {
    const limit = motion.distance.large;
    expect(originOffset({ x: 5000, y: -5000 }, { x: 0, y: 0 })).toEqual({ dx: limit, dy: -limit });
  });

  it('is no offset when a rect could not be read', () => {
    expect(originOffset({ x: Number.NaN, y: 0 }, { x: 0, y: 0 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('reelParts', () => {
  it('rolls ASCII digits and leaves everything else where it is', () => {
    expect(reelParts('$1,204')).toEqual([
      { kind: 'fixed', char: '$' },
      { kind: 'digit', digit: 1 },
      { kind: 'fixed', char: ',' },
      { kind: 'digit', digit: 2 },
      { kind: 'digit', digit: 0 },
      { kind: 'digit', digit: 4 },
    ]);
  });

  it('does not roll a digit of another script (it has no strip to roll through)', () => {
    expect(reelParts('٣')).toEqual([{ kind: 'fixed', char: '٣' }]);
  });
});

describe('fineStaggerDelayMs (CRD-6)', () => {
  it('steps at the fine pace, 40 ms, and stops at the same cap as the ordinary ramp', () => {
    expect([0, 1, 2, 3, 4, 5, 40].map((i) => fineStaggerDelayMs(i))).toEqual([0, 40, 80, 120, 160, 160, 160]);
  });

  it('never goes negative, and a whole grid still finishes inside one slow step', () => {
    expect(fineStaggerDelayMs(-2)).toBe(0);
    expect(fineStaggerDelayMs(999)).toBeLessThanOrEqual(motion.duration.slow);
  });
});
