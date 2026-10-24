import { BRAND } from '@newax/shared';
import { BURST_SPARKS, BURST_TIMING, burstTravel, journeyStates, sparkKeyframes } from './success-state';

const { duration, distance, scale } = BRAND.theme.motion;

describe('journeyStates', () => {
  it('marks what has happened, the one being waited on, and what is ahead', () => {
    expect(journeyStates(4, 0)).toEqual(['done', 'current', 'next', 'next']);
    expect(journeyStates(4, 1)).toEqual(['done', 'done', 'current', 'next']);
  });

  it('leaves no current step once the last one has been reached', () => {
    expect(journeyStates(3, 2)).toEqual(['done', 'done', 'done']);
  });

  it('clamps a status that is past the end or before the start', () => {
    expect(journeyStates(3, 9)).toEqual(['done', 'done', 'done']);
    expect(journeyStates(3, -4)).toEqual(['done', 'current', 'next']);
    expect(journeyStates(3, Number.NaN)).toEqual(['done', 'done', 'done']);
  });

  it('handles an empty thread', () => {
    expect(journeyStates(0, 0)).toEqual([]);
  });
});

describe('burstTravel', () => {
  it('throws the documented number of sparks, evenly round the badge', () => {
    const sparks = burstTravel();
    expect(sparks).toHaveLength(BURST_SPARKS);
    // The first goes straight up (y negative, x zero), the fifth straight down.
    expect(sparks[0]!.toX).toBe(0);
    expect(sparks[0]!.toY).toBeLessThan(0);
    expect(sparks[4]!.toX).toBe(0);
    expect(sparks[4]!.toY).toBeGreaterThan(0);
  });

  it('starts every spark on the badge edge and ends it `distance.medium` further out', () => {
    const edge = BRAND.theme.size.control.xl / 2;
    for (const spark of burstTravel()) {
      expect(Math.hypot(spark.fromX, spark.fromY)).toBeCloseTo(edge, 1);
      expect(Math.hypot(spark.toX, spark.toY)).toBeCloseTo(edge + distance.medium, 1);
    }
  });

  it('is symmetric, so the ring has no heavy side', () => {
    const sparks = burstTravel(8);
    const sum = sparks.reduce((acc, s) => ({ x: acc.x + s.toX, y: acc.y + s.toY }), { x: 0, y: 0 });
    expect(Math.abs(sum.x)).toBeLessThan(0.1);
    expect(Math.abs(sum.y)).toBeLessThan(0.1);
  });
});

describe('sparkKeyframes', () => {
  it('moves transform and opacity and nothing that forces layout', () => {
    const frames = sparkKeyframes(burstTravel()[0]!);
    expect(frames).toHaveLength(2);
    for (const frame of frames) expect(Object.keys(frame).sort()).toEqual(['opacity', 'transform']);
    expect(frames[1]!.opacity).toBe(0);
    expect(String(frames[1]!.transform)).toContain(`scale(${scale.pop})`);
  });
});

describe('BURST_TIMING', () => {
  it('reads every number from the motion tokens', () => {
    expect(BURST_TIMING.delay).toBe(duration.slow);
    expect(BURST_TIMING.duration).toBe(duration.sweep);
    expect(BURST_TIMING.easing).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });
});
