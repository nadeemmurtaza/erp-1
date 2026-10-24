/**
 * The declarative glue every report block reads through
 * (10-admin-dashboard.md D3): a block config names a dot-path into an
 * endpoint's JSON response (`totals.revenue`, `byCategory`, `series.0.t`) —
 * never a function, so the whole registry stays greppable and serialisable.
 */

/**
 * Walks a dot-path into `data`, returning `undefined` for any missing or
 * mistyped segment rather than throwing — a report whose endpoint hasn't
 * caught up with a block's path yet renders an empty state, not a crash.
 * A numeric segment (`"0"`, `"12"`) indexes into an array, exactly like the
 * object-key case, so `series.0.t` and `byCategory.0.name` both work.
 */
export function resolvePath(data: unknown, path: string): unknown {
  if (!path) return data;
  const segments = path.split('.');
  let current: unknown = data;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Fills a `{key}`-templated href (D3's `href` field on a `ranking`/`table`
 * block) from a row object, `encodeURIComponent`-ing every interpolated
 * value — a product name with a `/` or `&` in it must never split the URL
 * it's dropped into. A key missing from `row` interpolates to an empty
 * string rather than throwing or leaving the literal `{key}` in the URL.
 */
export function interpolateHref(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = row[key];
    return value === undefined || value === null ? '' : encodeURIComponent(String(value));
  });
}
