import {
  buildHeatCalendar,
  changeTone,
  foldShares,
  funnelSteps,
  gaugeState,
  heatLevel,
  heatMonthTotals,
  largestDropIndex,
  niceCeil,
  periodChange,
  quantileCuts,
  sharePct,
} from './chart-math';

describe('periodChange', () => {
  it('reports a rise and a fall with the absolute percentage', () => {
    expect(periodChange(115, 100)).toEqual({ kind: 'up', pct: 15 });
    expect(periodChange(75, 100)).toEqual({ kind: 'down', pct: 25 });
  });

  it('rounds to one decimal place', () => {
    expect(periodChange(18_400_000, 16_100_000)).toEqual({
      kind: 'up',
      pct: 14.3,
    });
  });

  it('calls an unchanged value flat', () => {
    expect(periodChange(100, 100)).toEqual({ kind: 'flat', pct: 0 });
  });

  it('rounds a change under a tenth of a percent to flat, not +0.0%', () => {
    expect(periodChange(100_000, 100_001)).toEqual({ kind: 'flat', pct: 0 });
  });

  it('does not invent a percentage from a zero baseline', () => {
    expect(periodChange(40, 0)).toEqual({ kind: 'new', pct: 0 });
    expect(periodChange(0, 0)).toEqual({ kind: 'flat', pct: 0 });
  });

  it('reports a fall to zero as a 100% drop', () => {
    expect(periodChange(0, 50)).toEqual({ kind: 'down', pct: 100 });
  });
});

describe('changeTone', () => {
  it('is success when the good direction was taken and danger when it was not', () => {
    expect(changeTone('up', true)).toBe('success');
    expect(changeTone('down', true)).toBe('danger');
  });

  it('inverts for a measure where lower is better', () => {
    expect(changeTone('down', false)).toBe('success');
    expect(changeTone('up', false)).toBe('danger');
  });

  it('keeps flat and new neutral either way', () => {
    expect(changeTone('flat', true)).toBe('neutral');
    expect(changeTone('new', false)).toBe('neutral');
  });
});

describe('foldShares', () => {
  const item = (label: string, value: number) => ({ label, value });

  it('sorts descending', () => {
    expect(foldShares([item('a', 1), item('c', 3), item('b', 2)]).map((s) => s.label)).toEqual(['c', 'b', 'a']);
  });

  it('folds everything past the fifth slice into one Other', () => {
    const slices = foldShares([1, 2, 3, 4, 5, 6, 7].map((n) => item(`s${n}`, n)));
    expect(slices).toHaveLength(6);
    expect(slices.at(-1)).toEqual({ label: 'Other', value: 3 });
  });

  it('adds no Other when nothing is left over', () => {
    expect(foldShares([item('a', 2), item('b', 1)])).toHaveLength(2);
  });

  it('never exceeds five named slices, whatever the caller asks for', () => {
    const slices = foldShares(
      Array.from({ length: 9 }, (_, i) => item(`s${i}`, i + 1)),
      8,
    );
    expect(slices).toHaveLength(6);
  });

  it('honours a smaller cap', () => {
    const slices = foldShares([item('a', 5), item('b', 4), item('c', 3)], 2);
    expect(slices).toEqual([item('a', 5), item('b', 4), { label: 'Other', value: 3 }]);
  });

  it('drops a tail that sums to zero instead of drawing an empty slice', () => {
    expect(foldShares([item('a', 5), item('b', 0), item('c', 0)], 1)).toEqual([item('a', 5)]);
  });

  it('does not mutate its input', () => {
    const input = [item('a', 1), item('b', 2)];
    foldShares(input);
    expect(input.map((s) => s.label)).toEqual(['a', 'b']);
  });

  it('returns nothing for nothing', () => {
    expect(foldShares([])).toEqual([]);
  });
});

describe('sharePct', () => {
  it('is a percentage to one decimal place', () => {
    expect(sharePct(1, 3)).toBe(33.3);
    expect(sharePct(1, 2)).toBe(50);
  });

  it('is 0 when the whole is 0, never NaN', () => {
    expect(sharePct(0, 0)).toBe(0);
  });
});

describe('funnelSteps', () => {
  const stages = [
    { label: 'Leads', value: 1000 },
    { label: 'Qualified', value: 400 },
    { label: 'Proposals', value: 200 },
    { label: 'Signed', value: 50 },
  ];

  it('gives the first stage no drop and every later stage its conversion', () => {
    const steps = funnelSteps(stages);
    expect(steps[0]).toMatchObject({ ofFirst: 100, ofPrevious: null, dropped: null, droppedPct: null });
    expect(steps[1]).toMatchObject({ ofFirst: 40, ofPrevious: 40, dropped: 600, droppedPct: 60 });
    expect(steps[3]).toMatchObject({ ofFirst: 5, ofPrevious: 25, dropped: 150, droppedPct: 75 });
  });

  it('shows a stage that grew as a negative drop instead of hiding it', () => {
    const steps = funnelSteps([
      { label: 'a', value: 10 },
      { label: 'b', value: 12 },
    ]);
    expect(steps[1]).toMatchObject({ dropped: -2, droppedPct: -20, ofPrevious: 120 });
  });

  it('does not divide by a zero first stage', () => {
    const steps = funnelSteps([
      { label: 'a', value: 0 },
      { label: 'b', value: 0 },
    ]);
    expect(steps.map((s) => s.ofFirst)).toEqual([0, 0]);
    expect(steps[1]!.droppedPct).toBe(0);
  });

  it('returns nothing for nothing', () => {
    expect(funnelSteps([])).toEqual([]);
  });
});

describe('largestDropIndex', () => {
  it('finds the stage that lost the most, by percentage', () => {
    const steps = funnelSteps([
      { label: 'a', value: 1000 },
      { label: 'b', value: 900 },
      { label: 'c', value: 300 },
      { label: 'd', value: 250 },
    ]);
    expect(largestDropIndex(steps)).toBe(2);
  });

  it('is null when nothing was lost', () => {
    expect(
      largestDropIndex(
        funnelSteps([
          { label: 'a', value: 5 },
          { label: 'b', value: 5 },
        ]),
      ),
    ).toBeNull();
    expect(largestDropIndex([])).toBeNull();
  });
});

describe('gaugeState', () => {
  it('reports percentage and fill', () => {
    expect(gaugeState(30, 40)).toEqual({ pct: 75, fill: 0.75, status: 'ok' });
  });

  it('keeps the true percentage past the goal but caps the fill', () => {
    expect(gaugeState(112, 100)).toEqual({ pct: 112, fill: 1, status: 'complete' });
  });

  it('has no severity for progress toward a target', () => {
    expect(gaugeState(99, 100).status).toBe('ok');
  });

  it('warns and goes critical for a capacity at the stated fractions', () => {
    expect(gaugeState(79, 100, { kind: 'capacity' }).status).toBe('ok');
    expect(gaugeState(80, 100, { kind: 'capacity' }).status).toBe('warning');
    expect(gaugeState(94, 100, { kind: 'capacity' }).status).toBe('warning');
    expect(gaugeState(95, 100, { kind: 'capacity' }).status).toBe('critical');
    expect(gaugeState(130, 100, { kind: 'capacity' })).toEqual({ pct: 130, fill: 1, status: 'critical' });
  });

  it('honours custom thresholds', () => {
    expect(gaugeState(60, 100, { kind: 'capacity', warnAt: 0.5, criticalAt: 0.9 }).status).toBe('warning');
  });

  it('treats a missing or negative goal as empty, never NaN or Infinity', () => {
    expect(gaugeState(5, 0)).toEqual({ pct: 0, fill: 0, status: 'ok' });
    expect(gaugeState(5, -3)).toEqual({ pct: 0, fill: 0, status: 'ok' });
  });

  it('clamps a negative value to empty', () => {
    expect(gaugeState(-5, 100)).toEqual({ pct: 0, fill: 0, status: 'ok' });
  });
});

describe('quantileCuts and heatLevel', () => {
  it('cuts the non-zero days into quartiles', () => {
    expect(quantileCuts([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([3, 5, 7]);
  });

  it('ignores zero days, so a quiet calendar does not drag the cuts down', () => {
    expect(quantileCuts([0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual([3, 5, 7]);
  });

  it('is zeros for nothing', () => {
    expect(quantileCuts([])).toEqual([0, 0, 0]);
    expect(quantileCuts([0, 0])).toEqual([0, 0, 0]);
  });

  it('puts one outlier in the top level without flattening the rest', () => {
    const cuts = quantileCuts([1, 1, 2, 2, 3, 3, 4, 4, 500]);
    expect(heatLevel(500, cuts)).toBe(4);
    // The ordinary days still spread across levels 1 to 3 instead of all landing in the palest one.
    expect([1, 3, 4].map((v) => heatLevel(v, cuts))).toEqual([1, 2, 3]);
  });

  it('maps a value to a level at the boundaries', () => {
    const cuts: [number, number, number] = [3, 5, 7];
    expect([0, 1, 3, 4, 5, 6, 7, 8].map((v) => heatLevel(v, cuts))).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});

describe('buildHeatCalendar', () => {
  // 2026-03-02 is a Monday; 2026-03-08 the Sunday that ends its week.
  const days = [
    { date: '2026-02-23', value: 4 },
    { date: '2026-03-02', value: 2 },
    { date: '2026-03-04', value: 8 },
  ];

  it('returns no weeks for no data or no window', () => {
    expect(buildHeatCalendar([]).weeks).toEqual([]);
    expect(buildHeatCalendar(days, 0).weeks).toEqual([]);
  });

  it('lays out Monday-first columns of seven, ending with the week of the latest day', () => {
    const { weeks } = buildHeatCalendar(days, 2);
    expect(weeks).toHaveLength(2);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]!.date).toBe('2026-02-23');
    expect(weeks[1]![0]!.date).toBe('2026-03-02');
    expect(weeks[1]![2]!.date).toBe('2026-03-04');
  });

  it('leaves the days after the latest data day empty, not zero', () => {
    const { weeks } = buildHeatCalendar(days, 2);
    expect(weeks[1]![2]).not.toBeNull();
    expect(weeks[1]![3]).toBeNull();
    expect(weeks[1]![6]).toBeNull();
  });

  it('counts a missing day inside the window as zero activity', () => {
    const { weeks } = buildHeatCalendar(days, 2);
    expect(weeks[0]![1]).toMatchObject({ date: '2026-02-24', value: 0, level: 0 });
  });

  it('drops data older than the window', () => {
    const { weeks } = buildHeatCalendar(days, 1);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.some((c) => c?.date === '2026-02-23')).toBe(false);
  });

  it('marks the first week of each month for the labels', () => {
    const { months } = buildHeatCalendar(days, 2);
    expect(months.map((m) => m.column)).toEqual([0, 1]);
    expect(months[0]!.date).toBe('2026-02-23');
    expect(months[1]!.date).toBe('2026-03-02');
  });

  it('is not moved by the machine timezone', () => {
    const { weeks } = buildHeatCalendar([{ date: '2026-01-01', value: 1 }], 1);
    expect(weeks[0]!.find((c) => c?.value === 1)!.date).toBe('2026-01-01');
  });
});

describe('heatMonthTotals', () => {
  it('totals each month and names its busiest day', () => {
    const calendar = buildHeatCalendar(
      [
        { date: '2026-02-26', value: 3 },
        { date: '2026-02-27', value: 5 },
        { date: '2026-03-02', value: 2 },
        { date: '2026-03-04', value: 8 },
        { date: '2026-03-05', value: 8 },
      ],
      2,
    );
    const [feb, mar] = heatMonthTotals(calendar);
    expect(feb).toEqual({ month: '2026-02', total: 8, busiest: { date: '2026-02-27', value: 5 } });
    expect(mar).toEqual({ month: '2026-03', total: 18, busiest: { date: '2026-03-04', value: 8 } });
  });

  it('is empty for an empty calendar', () => {
    expect(heatMonthTotals(buildHeatCalendar([]))).toEqual([]);
  });
});

describe('niceCeil', () => {
  it.each([
    [51_000, 60_000],
    [60_000, 60_000],
    [18, 20],
    [1, 1],
    [0.07, 0.08],
    [100, 100],
    [101, 150],
    [999, 1000],
  ])('rounds %s up to %s', (input, expected) => {
    expect(niceCeil(input)).toBeCloseTo(expected, 10);
  });

  it('never returns zero or NaN', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(Number.NaN)).toBe(1);
  });
});
