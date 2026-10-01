import { BRAND } from '@newax/shared';
import { staggerDelayMs } from '@/lib/motion';
import {
  CHART_DRAW_MS,
  CHART_EASING,
  CHART_POP_MS,
  CHART_TOOLTIP_MS,
  chartActiveDot,
  chartCursor,
  chartDrawProps,
  chartTooltipMotion,
  cubicBezierCss,
  pointPopDelayMs,
  pointPopStyle,
} from './chart-motion';

const { duration, easing, stagger } = BRAND.theme.motion;

describe('chartDrawProps', () => {
  it('switches animation off under reduced motion, with no delay', () => {
    const props = chartDrawProps(true, 3);
    expect(props.isAnimationActive).toBe(false);
    expect(props.animationBegin).toBe(0);
  });

  it('animates by default', () => {
    expect(chartDrawProps(false).isAnimationActive).toBe(true);
  });

  it('draws over the sweep step on the settle curve, the same for every series', () => {
    for (const index of [0, 1, 2, 5, 9]) {
      const props = chartDrawProps(false, index);
      expect(props.animationDuration).toBe(duration.sweep);
      expect(props.animationEasing).toBe(CHART_EASING);
    }
    expect(CHART_DRAW_MS).toBe(duration.sweep);
    expect(CHART_EASING).toBe(`cubic-bezier(${easing.settle.join(',')})`);
  });

  it('never runs past the longest step in the language', () => {
    expect(chartDrawProps(false).animationDuration).toBeLessThanOrEqual(duration.sweep);
  });

  it('starts series one after another on the shared stagger ramp', () => {
    for (let index = 0; index < 8; index += 1) {
      expect(chartDrawProps(false, index).animationBegin).toBe(staggerDelayMs(index));
    }
    expect(chartDrawProps(false).animationBegin).toBe(0);
    expect(chartDrawProps(false, 1).animationBegin).toBe(stagger.step);
  });

  it('caps the stagger at the configured number of steps', () => {
    const cap = stagger.steps * stagger.step;
    expect(chartDrawProps(false, stagger.steps).animationBegin).toBe(cap);
    expect(chartDrawProps(false, 50).animationBegin).toBe(cap);
  });
});

describe('cubicBezierCss', () => {
  it('writes a token tuple as the cubic-bezier string Recharts and CSS read', () => {
    expect(cubicBezierCss([0.16, 1, 0.3, 1])).toBe('cubic-bezier(0.16,1,0.3,1)');
  });

  it('keeps the settle curve from overshooting', () => {
    expect(easing.settle[1]).toBeLessThanOrEqual(1);
    expect(easing.settle[3]).toBeLessThanOrEqual(1);
  });
});

describe('chartTooltipMotion', () => {
  it('glides over the normal step on the settle curve', () => {
    expect(chartTooltipMotion(false)).toEqual({
      isAnimationActive: true,
      animationDuration: duration.normal,
      animationEasing: CHART_EASING,
    });
    expect(CHART_TOOLTIP_MS).toBe(duration.normal);
  });

  it('does not glide under reduced motion', () => {
    expect(chartTooltipMotion(true).isAnimationActive).toBe(false);
  });
});

describe('pointPopDelayMs', () => {
  it('is 0 for a single point', () => {
    expect(pointPopDelayMs(0, 1)).toBe(0);
    expect(pointPopDelayMs(0, 0)).toBe(0);
  });

  it('is 0 for the first point of the first series', () => {
    expect(pointPopDelayMs(0, 12)).toBe(0);
  });

  it('only increases along the line', () => {
    const count = 30;
    let previous = -1;
    for (let index = 0; index < count; index += 1) {
      const delay = pointPopDelayMs(index, count);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it('pops a marker later the further along the line it sits', () => {
    expect(pointPopDelayMs(9, 10)).toBeGreaterThan(pointPopDelayMs(2, 10));
  });

  it('never exceeds the draw time plus the series stagger, and the pop finishes inside the draw', () => {
    for (const seriesIndex of [0, 1, 3, 7]) {
      for (const count of [2, 3, 12, 365]) {
        for (let index = 0; index < count; index += 1) {
          const delay = pointPopDelayMs(index, count, CHART_DRAW_MS, seriesIndex);
          expect(delay).toBeLessThanOrEqual(CHART_DRAW_MS + staggerDelayMs(seriesIndex));
          expect(delay - staggerDelayMs(seriesIndex) + CHART_POP_MS).toBeLessThanOrEqual(CHART_DRAW_MS);
        }
      }
    }
  });

  it('adds the series stagger to every marker of a later series', () => {
    expect(pointPopDelayMs(0, 12, CHART_DRAW_MS, 2)).toBe(staggerDelayMs(2));
    expect(pointPopDelayMs(5, 12, CHART_DRAW_MS, 2)).toBe(pointPopDelayMs(5, 12, CHART_DRAW_MS, 0) + staggerDelayMs(2));
  });

  it('follows the eased line, not the linear one: the middle marker is reached early', () => {
    // Settle covers most of the line in the first part of the draw, so half-way along is well before half the time.
    expect(pointPopDelayMs(5, 11)).toBeLessThan(CHART_DRAW_MS / 2);
  });

  it('copes with a draw too short to hold a pop', () => {
    expect(pointPopDelayMs(4, 5, 100)).toBe(0);
    expect(pointPopDelayMs(4, 5, 0)).toBe(0);
  });
});

describe('pointPopStyle', () => {
  it('sets the --pop-delay that .chart-point reads, in ms', () => {
    expect(pointPopStyle(0, 1)).toEqual({ '--pop-delay': '0ms' });
    expect(pointPopStyle(3, 8, CHART_DRAW_MS, 1)).toEqual({
      '--pop-delay': `${pointPopDelayMs(3, 8, CHART_DRAW_MS, 1)}ms`,
    });
  });
});

describe('cursors and active dot', () => {
  it('draws the hover band from the theme wash with no stroke and a small radius', () => {
    expect(chartCursor.band.fill).toMatch(/^rgb\(var\(--color-/);
    expect(chartCursor.band.stroke).toBe('none');
    expect(chartCursor.band.radius).toBeLessThanOrEqual(4);
  });

  it('draws a 1px crosshair in a theme token', () => {
    expect(chartCursor.crosshair.strokeWidth).toBe(1);
    expect(chartCursor.crosshair.stroke).toMatch(/^rgb\(var\(--color-/);
  });

  it('uses no hex literal anywhere in the hover layer', () => {
    expect(JSON.stringify([chartCursor, chartActiveDot])).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('pops the active dot in with the shared marker class', () => {
    expect(chartActiveDot.className).toBe('chart-point');
    expect(chartActiveDot.r).toBeGreaterThan(4);
  });
});
