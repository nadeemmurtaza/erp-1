import type { AppConfigService } from '../config/app-config.service';

/**
 * Folds this node's identity into a locally-allocated sequence, so that
 * once two nodes' facts merge upward (RETAIL-ERP.md R2) the numbers they
 * generated independently can never collide — WO-18.2, R6's "Numbers
 * become node-prefixed".
 *
 * A STANDALONE deployment — every deployment today — gets exactly the
 * format it has always had, `PREFIX-YEAR-SEQ`, because there is only one
 * node and nothing to disambiguate. That is a Tranche-1 acceptance
 * criterion in its own right: an existing database "behaves identically
 * before and after". `BRANCH`, `BRAND` and `ORG` fold in `NODE_ID`.
 *
 * This composes only the final string. The sequence itself is still
 * allocated purely locally by whatever mechanism the call site already
 * uses — a per-year counter row (`OrderNumberCounter` and its two
 * siblings), or an advisory lock plus a `MAX` scan (purchasing,
 * stock-count) — and neither mechanism changes: it only has to be
 * race-free within this node's own database, which it already is, network
 * or no network.
 */
type NodeIdentity = Pick<AppConfigService, 'nodeRole' | 'nodeId'>;

function basePrefix(config: NodeIdentity, prefix: string, year: number): string {
  return config.nodeRole === 'STANDALONE'
    ? `${prefix}-${year}-`
    : `${prefix}-${config.nodeId}-${year}-`;
}

export function documentNumber(
  config: NodeIdentity,
  prefix: string,
  year: number,
  sequence: number,
): string {
  return `${basePrefix(config, prefix, year)}${String(sequence).padStart(4, '0')}`;
}

/**
 * The bare `PREFIX-YEAR-` (or `PREFIX-NODE_ID-YEAR-`) stem, with no
 * sequence — for a caller that allocates its own sequence by scanning
 * existing numbers (a `LIKE` clause plus `MAX`) rather than a counter row.
 * Kept in step with documentNumber() by sharing basePrefix() rather than
 * each call site re-deriving the branch on NODE_ROLE.
 */
export function documentNumberPrefix(config: NodeIdentity, prefix: string, year: number): string {
  return basePrefix(config, prefix, year);
}
