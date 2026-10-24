/**
 * WO-3.9 (03-variants-sku-seo.md) — the loop/chain guard, as a pure function
 * so it can be dry-run and unit tested without a database.
 *
 * "Before writing A -> B, if a redirect B -> A exists, refuse. If X -> A
 * exists, rewrite it to X -> B so chains never form." Both are cheap to
 * write here and expensive to discover later as a 10-hop redirect loop in
 * production.
 */
export interface RedirectRow {
  fromPath: string;
  toPath: string;
}

export interface ChainGuardResult {
  refused: boolean;
  reason?: string;
  /** Existing rows whose `toPath` must become the new `toPath`, so no chain forms. */
  rewrites: RedirectRow[];
}

export function checkRedirectChain(
  from: string,
  to: string,
  existing: RedirectRow[],
): ChainGuardResult {
  if (from === to) {
    return { refused: true, reason: 'A path cannot redirect to itself.', rewrites: [] };
  }

  const reverseExists = existing.some((row) => row.fromPath === to && row.toPath === from);
  if (reverseExists) {
    return {
      refused: true,
      reason: `"${to}" already redirects back to "${from}" — this would form a loop.`,
      rewrites: [],
    };
  }

  // Any redirect currently ending at `from` would otherwise chain through it
  // (X -> from -> to) — point it straight at the new destination instead.
  const rewrites = existing
    .filter((row) => row.toPath === from && row.fromPath !== to)
    .map((row) => ({ fromPath: row.fromPath, toPath: to }));

  return { refused: false, rewrites };
}
