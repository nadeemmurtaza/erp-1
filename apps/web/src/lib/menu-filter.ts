/**
 * What a menu does with a list of options (MNU-1, MNU-6): which control the
 * count asks for, and how typing narrows it.
 *
 * Pure, so the thresholds and the matching are tested rather than eyeballed, and
 * so a call site never decides them: `Select` asks `menuKind(options.length)`.
 */

/**
 * Parameter: the largest list that opens as a plain list. Exact value: 10.
 * MNU-1: more than 10 options needs a search field, focused on open. Ten is
 * what fits a 640 px-tall window without scrolling at 44 px a row less chrome,
 * so past it the reader would scroll to find Lahore among 140 branches.
 */
export const FILTER_THRESHOLD = 10;

/**
 * Parameter: the smallest list that is a menu. Exact value: 5.
 * MNU-6 sets it: fewer than five options is a segmented control, because every
 * option is then visible with no click and the row stays short enough to read
 * as one thing (it wraps rather than overflows at 280 px). From five up, a row of
 * capsules becomes a block of them and a menu is the calmer control.
 */
export const SEGMENT_LIMIT = 5;

export type MenuKind = 'segmented' | 'menu' | 'menu-search';

/** True when a list this long needs a search field on top (MNU-1). */
export function needsSearch(count: number): boolean {
  return count > FILTER_THRESHOLD;
}

/**
 * The control a list of this length is (MNU-6, MNU-1). An empty list is a menu,
 * not a segmented control: there is nothing to lay out in a row, and a closed
 * menu can say "No options" where an empty row says nothing.
 */
export function menuKind(count: number): MenuKind {
  if (count <= 0) return 'menu';
  if (count < SEGMENT_LIMIT) return 'segmented';
  return needsSearch(count) ? 'menu-search' : 'menu';
}

/** A half-open range `[start, end)` of UTF-16 indices into the original label. */
export type MatchRange = readonly [number, number];

export interface FilterResult<T> {
  option: T;
  /** Where the query matched in `option.label`, sorted and non-overlapping, for highlighting. */
  ranges: MatchRange[];
}

/**
 * Lower-cases and strips accents, remembering which original index each folded
 * character came from. Folding can change length (a decomposed "é" is two code
 * points, one of them a mark that is dropped), so a match found in the folded
 * text has to be mapped back before it can highlight the label the reader sees.
 */
function fold(text: string): { folded: string; origin: number[]; widths: number[] } {
  let folded = '';
  const origin: number[] = [];
  const widths: number[] = [];
  let index = 0;
  for (const ch of text) {
    const width = ch.length;
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const f of base) {
      folded += f;
      // One entry per UTF-16 unit of the folded string, so indices line up.
      for (let i = 0; i < f.length; i += 1) {
        origin.push(index);
        widths.push(width);
      }
    }
    index += width;
  }
  return { folded, origin, widths };
}

function isWordStart(folded: string, at: number): boolean {
  if (at === 0) return true;
  return !/[\p{L}\p{N}]/u.test(folded[at - 1]!);
}

/** The first match of `token`, preferring one that begins a word. */
function findToken(folded: string, token: string): { at: number; wordStart: boolean } | null {
  let first = -1;
  let from = 0;
  for (;;) {
    const at = folded.indexOf(token, from);
    if (at === -1) break;
    if (first === -1) first = at;
    if (isWordStart(folded, at)) return { at, wordStart: true };
    from = at + 1;
  }
  return first === -1 ? null : { at: first, wordStart: false };
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Narrows `options` by what was typed.
 *
 * Words are separated by spaces and every word must match, in any order, so
 * "kar ware" finds "Karachi warehouse". Case and accents are ignored. An option
 * whose every word matches at the START of a word ranks ahead of one that only
 * matches inside a word ("rac" in "Karachi"), and within each group the original
 * order is kept, so the list never shuffles while someone is typing. An empty
 * query returns everything, unmarked.
 */
export function filterOptions<T extends { label: string }>(options: readonly T[], query: string): FilterResult<T>[] {
  const tokens = fold(query.trim()).folded.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return options.map((option) => ({ option, ranges: [] }));

  const hits: { result: FilterResult<T>; tier: number; index: number }[] = [];
  options.forEach((option, index) => {
    const { folded, origin, widths } = fold(option.label);
    const ranges: MatchRange[] = [];
    let tier = 0;
    for (const token of tokens) {
      const found = findToken(folded, token);
      if (!found) return;
      if (!found.wordStart) tier = 1;
      const last = found.at + token.length - 1;
      ranges.push([origin[found.at]!, origin[last]! + widths[last]!]);
    }
    hits.push({ result: { option, ranges: mergeRanges(ranges) }, tier, index });
  });

  // Array.prototype.sort is stable, but the index tiebreak states the guarantee.
  return hits.sort((a, b) => a.tier - b.tier || a.index - b.index).map((hit) => hit.result);
}

/**
 * Type-ahead for a list with no search field: the index of the next option whose
 * label starts with what has been typed, starting after `from` and wrapping.
 * Typing the same letter again steps to the next option with that initial.
 * Returns -1 when nothing starts with it.
 */
export function typeAheadIndex(labels: readonly string[], typed: string, from: number): number {
  const needle = fold(typed).folded;
  if (!needle || labels.length === 0) return -1;
  const repeated = needle.length > 1 && [...needle].every((c) => c === needle[0]);
  const prefix = repeated ? needle[0]! : needle;
  // A growing prefix ("ka", then "kar") should keep the current match if it still fits.
  const start = needle.length > 1 && !repeated ? from : from + 1;
  for (let step = 0; step < labels.length; step += 1) {
    const i = (((start + step) % labels.length) + labels.length) % labels.length;
    if (fold(labels[i]!).folded.startsWith(prefix)) return i;
  }
  return -1;
}

/**
 * Parameter: how long a pause ends a type-ahead word. Exact value: 700 ms.
 * Under half a second splits a normal typist's word in two; over a second makes
 * the next letter extend a word the reader has already moved on from.
 */
export const TYPE_AHEAD_RESET_MS = 700;
