import { FILTER_THRESHOLD, SEGMENT_LIMIT, filterOptions, menuKind, needsSearch, typeAheadIndex } from './menu-filter';

const labels = (results: { option: { label: string } }[]) => results.map((r) => r.option.label);
const opts = (...names: string[]) => names.map((label) => ({ label }));

describe('thresholds', () => {
  it('names the numbers the laws state', () => {
    expect(FILTER_THRESHOLD).toBe(10);
    expect(SEGMENT_LIMIT).toBe(5);
  });

  it('needs a search field only past ten', () => {
    expect(needsSearch(10)).toBe(false);
    expect(needsSearch(11)).toBe(true);
    expect(needsSearch(140)).toBe(true);
  });

  it('chooses the control from the count (MNU-6, MNU-1)', () => {
    expect(menuKind(1)).toBe('segmented');
    expect(menuKind(4)).toBe('segmented');
    expect(menuKind(5)).toBe('menu');
    expect(menuKind(10)).toBe('menu');
    expect(menuKind(11)).toBe('menu-search');
    expect(menuKind(140)).toBe('menu-search');
  });

  it('treats an empty list as a menu that can say so, not a row of nothing', () => {
    expect(menuKind(0)).toBe('menu');
  });
});

describe('filterOptions', () => {
  it('returns everything, unmarked, for an empty or blank query', () => {
    const o = opts('Karachi', 'Lahore');
    expect(filterOptions(o, '')).toEqual([
      { option: o[0], ranges: [] },
      { option: o[1], ranges: [] },
    ]);
    expect(labels(filterOptions(o, '   '))).toEqual(['Karachi', 'Lahore']);
  });

  it('ignores case', () => {
    expect(labels(filterOptions(opts('Lahore', 'Karachi'), 'LAH'))).toEqual(['Lahore']);
  });

  it('ignores accents in both directions', () => {
    expect(labels(filterOptions(opts('Café Münster', 'Plain'), 'cafe munster'))).toEqual(['Café Münster']);
    expect(labels(filterOptions(opts('Cafe Munster'), 'CAFÉ'))).toEqual(['Cafe Munster']);
  });

  it('ranks word-start matches ahead of substring matches, keeping order inside each group', () => {
    const result = filterOptions(opts('Karachi', 'Ariana Foods', 'Rahim Ali', 'Marach'), 'ra');
    // "Rahim" starts a word with "ra"; "Karachi" and "Marach" only contain it. Ariana: "ar-ia-na" has "ra"? no.
    expect(labels(result)).toEqual(['Rahim Ali', 'Karachi', 'Marach']);
  });

  it('matches a word start anywhere in the label', () => {
    expect(labels(filterOptions(opts('North Warehouse', 'Southern Depot'), 'war'))).toEqual(['North Warehouse']);
  });

  it('requires every word, in any order', () => {
    const o = opts('Karachi warehouse', 'Karachi shop', 'Lahore warehouse');
    expect(labels(filterOptions(o, 'ware kar'))).toEqual(['Karachi warehouse']);
    expect(labels(filterOptions(o, 'kar xyz'))).toEqual([]);
  });

  it('is stable: equal ranks keep their original order', () => {
    const result = filterOptions(opts('Beta 1', 'Beta 2', 'Beta 3'), 'beta');
    expect(labels(result)).toEqual(['Beta 1', 'Beta 2', 'Beta 3']);
  });

  it('returns match ranges into the original label', () => {
    const [hit] = filterOptions(opts('Karachi warehouse'), 'ware kar');
    expect(hit!.ranges).toEqual([
      [0, 3],
      [8, 12],
    ]);
  });

  it('maps ranges back through accents so the highlight lands on the visible letters', () => {
    // "é" is one visible character; the match must cover it, not the code point after it.
    const [hit] = filterOptions(opts('Café Münster'), 'cafe');
    expect(hit!.ranges).toEqual([[0, 4]]);
    const [munster] = filterOptions(opts('Café Münster'), 'mun');
    expect(munster!.ranges).toEqual([[5, 8]]);
  });

  it('merges overlapping ranges into one', () => {
    const [hit] = filterOptions(opts('Karachi'), 'kar ara');
    expect(hit!.ranges).toEqual([[0, 4]]);
  });

  it('returns nothing, not an error, when no option matches', () => {
    expect(filterOptions(opts('a', 'b'), 'zzz')).toEqual([]);
  });

  it('does not mutate its input', () => {
    const o = opts('Beta', 'Alpha');
    filterOptions(o, 'a');
    expect(labels(o.map((option) => ({ option })))).toEqual(['Beta', 'Alpha']);
  });
});

describe('typeAheadIndex', () => {
  const list = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry'];

  it('finds the next option starting with the letter, after the current one', () => {
    expect(typeAheadIndex(list, 'b', 0)).toBe(2);
    expect(typeAheadIndex(list, 'b', 2)).toBe(3);
  });

  it('wraps past the end', () => {
    expect(typeAheadIndex(list, 'a', 1)).toBe(0);
  });

  it('keeps the current match while the typed prefix still fits it', () => {
    expect(typeAheadIndex(list, 'bl', 2)).toBe(3);
    expect(typeAheadIndex(list, 'ap', 0)).toBe(0);
    expect(typeAheadIndex(list, 'apr', 0)).toBe(1);
  });

  it('steps through the same initial when one letter is repeated', () => {
    expect(typeAheadIndex(list, 'aa', 0)).toBe(1);
  });

  it('returns -1 when nothing starts with it, or the list is empty', () => {
    expect(typeAheadIndex(list, 'z', 0)).toBe(-1);
    expect(typeAheadIndex([], 'a', 0)).toBe(-1);
    expect(typeAheadIndex(list, '', 0)).toBe(-1);
  });

  it('ignores case and accents', () => {
    expect(typeAheadIndex(['Zebra', 'Ébène'], 'e', 0)).toBe(1);
  });
});
