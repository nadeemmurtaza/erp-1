/**
 * The deciding functions behind the publish-and-audience specimen.
 *
 * They take inputs and return outcomes and hold no state, so the screen that
 * will one day use them and a dry run over last month's data can call the same
 * code (CLAUDE.md, "Dry run before live"). The numbers are illustrative: the
 * specimen's world has `AUDIENCE_POOL` partner accounts and each filter keeps a
 * stated share of them. A real screen replaces `estimateAudience` with a count
 * the server computes; the contract it must keep is the one the spec pins:
 * adding a filter never raises the count, and the same inputs give the same
 * answer.
 */

export type Visibility = 'directory' | 'unlisted' | 'private';
export type AudienceScope = 'all' | 'region' | 'custom';

/** Partner accounts in the specimen's world. */
export const AUDIENCE_POOL = 4800;
/** Widest radius the builder offers, in kilometres. */
export const MAX_RADIUS_KM = 500;
export const MIN_RADIUS_KM = 10;

/** The share of the pool that sits in the viewer's own region. */
const REGION_SHARE = 0.42;

export const INDUSTRIES = [
  { key: 'retail', label: 'Retail', share: 0.34 },
  { key: 'wholesale', label: 'Wholesale', share: 0.22 },
  { key: 'manufacturing', label: 'Manufacturing', share: 0.18 },
  { key: 'hospitality', label: 'Hospitality', share: 0.12 },
] as const;

export const VERIFICATIONS = [
  { key: 'identity', label: 'Identity verified', share: 0.7 },
  { key: 'tax', label: 'Tax registered', share: 0.55 },
  { key: 'active', label: 'Active in 90 days', share: 0.8 },
  { key: 'audited', label: 'Site audited', share: 0.01 },
] as const;

export interface AudienceFilters {
  radiusKm: number;
  industries: readonly string[];
  verifications: readonly string[];
}

const shareOf = (list: readonly { key: string; share: number }[], keys: readonly string[]) => {
  const picked = list.filter((item) => keys.includes(item.key));
  // No tag chosen means every industry: an empty filter narrows nothing.
  return picked.length === 0
    ? 1
    : Math.min(
        1,
        picked.reduce((sum, item) => sum + item.share, 0),
      );
};

/**
 * How many accounts an audience reaches. Radius keeps `radius / MAX` of the
 * pool (never below the minimum, so a slider at its floor still means
 * something), industries keep the sum of the chosen shares, and each
 * verification multiplies by its own share, since they are independent checks.
 */
export function estimateAudience(scope: AudienceScope, filters: AudienceFilters): number {
  if (scope === 'all') return AUDIENCE_POOL;
  if (scope === 'region') return Math.round(AUDIENCE_POOL * REGION_SHARE);

  const radius = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, filters.radiusKm)) / MAX_RADIUS_KM;
  const verification = VERIFICATIONS.filter((v) => filters.verifications.includes(v.key)).reduce(
    (product, v) => product * v.share,
    1,
  );
  return Math.round(AUDIENCE_POOL * radius * shareOf(INDUSTRIES, filters.industries) * verification);
}

/**
 * Whether the audience questions apply. Only a profile listed in the directory is
 * *shown* to a chosen set of partners. An unlisted link is open to whoever holds
 * it and an internal profile to signed-in staff, so for those two "which
 * partners?" has no meaning and the form does not ask it.
 */
export function visibilityUsesAudience(visibility: Visibility): boolean {
  return visibility === 'directory';
}

export type Friction = 'none' | 'confirm';

/**
 * How much it costs to say yes (`ACT-6`). Going into the directory is wide and
 * cannot be fully recalled, because search engines and partners' own copies
 * outlive an unpublish, so it names the object and the audience first. An
 * unlisted link or an internal profile is small and reversible: do it, offer
 * undo.
 */
export function publishFriction(visibility: Visibility): Friction {
  return visibility === 'directory' ? 'confirm' : 'none';
}

/**
 * Why Publish is not available yet, or null. Every refusal says what to change
 * (`FLO-7`).
 */
export function publishBlocker(visibility: Visibility, scope: AudienceScope, count: number | null): string | null {
  if (!visibilityUsesAudience(visibility)) return null;
  if (scope === 'custom' && count === 0) {
    return 'These filters match nobody. Widen the radius, or clear an industry or a verification.';
  }
  return null;
}
