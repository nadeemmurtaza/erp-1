/**
 * The deciding functions behind the people-and-access specimen.
 *
 * The refusal strings are the ones `OrgUnitGrantService` returns from its own
 * checks (`org-unit-grant.service.ts`), because a screen that predicts a refusal
 * in words the server will not use teaches the person to distrust both. The
 * server stays the authority; these only let the screen say "no" before the
 * round trip, with the same reason (`PRM-2`, `FLO-7`).
 */

export type GrantMode = 'READ' | 'ACTING';

/**
 * The longest a grant may run. In the product this is a setting
 * (`getOrgAccessMaxGrantDays`); the specimen fixes a value so the three presets
 * below can show one over the limit refused.
 */
export const MAX_GRANT_DAYS = 14;

export const GRANT_PRESETS = [
  { days: 1, label: '1 day' },
  { days: 7, label: '1 week' },
  { days: 30, label: '30 days' },
] as const;

export interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  /**
   * The branches this person's rows come from. Empty means none, never all:
   * a scope with no written meaning for "empty" is how one account ends up
   * seeing every branch.
   */
  scopes: readonly string[];
  /** Higher outranks lower. The org-access rule is "outranks", never "equals". */
  rank: number;
  /** The person looking at the screen. Their own row is read-only to them. */
  isViewer?: boolean;
}

export interface GrantDraft {
  enabled: boolean;
  days: number;
  mode: GrantMode;
  countersignerId: string;
  reason: string;
}

export const EMPTY_GRANT: GrantDraft = { enabled: false, days: 7, mode: 'READ', countersignerId: '', reason: '' };

const DAY_MS = 86_400_000;

/** An absolute end, never "N days": a grant has an `expiresAt`, and it is never null. */
export function grantEndsAt(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/** What the server would refuse, in the server's words. Empty when the grant is not being issued. */
export function grantRefusals(draft: GrantDraft, recipient: Person, people: readonly Person[]): string[] {
  if (!draft.enabled) return [];
  const refusals: string[] = [];

  if (draft.days > MAX_GRANT_DAYS) {
    refusals.push(`A grant cannot run longer than ${MAX_GRANT_DAYS} days from now.`);
  }

  if (draft.mode === 'ACTING') {
    if (!draft.countersignerId) {
      refusals.push('An acting grant needs a countersignature from someone who outranks the recipient.');
    } else {
      const signer = people.find((p) => p.id === draft.countersignerId);
      if (!signer || signer.rank <= recipient.rank) {
        refusals.push('The countersigner does not outrank the recipient.');
      }
    }
  }
  return refusals;
}

/** People who may countersign for this recipient: strictly higher rank, never the recipient, never the viewer's own entry twice. */
export function countersignCandidates(recipient: Person, people: readonly Person[]): Person[] {
  return people.filter((p) => p.id !== recipient.id && p.rank > recipient.rank);
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/**
 * How long a grant has left, in the units a person plans in: days and hours,
 * then hours and minutes, then minutes. Never seconds: the notice announces at
 * thresholds, not every tick (`Access that ends`).
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'ended';
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  // Rounded up: a grant with seconds left has not ended, so it never reads "0 min".
  return `${Math.max(1, minutes)} min`;
}

/** Under an hour the notice turns from information to warning, and says so in words as well as colour. */
export function endsSoon(ms: number): boolean {
  return ms < HOUR_MS;
}

export function scopeDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  return {
    added: after.filter((scope) => !before.includes(scope)),
    removed: before.filter((scope) => !after.includes(scope)),
  };
}

/**
 * Why Save is off, or null. The first reason wins, in the order a person would
 * fix them: you may not do this at all, then what the server would refuse, then
 * what is still missing, then that there is nothing to save.
 */
export function saveBlocker(input: {
  selfEdit: boolean;
  refusals: readonly string[];
  grantEnabled: boolean;
  reason: string;
  changed: boolean;
}): string | null {
  if (input.selfEdit) return 'You cannot change your own access. Ask another administrator.';
  if (input.refusals.length > 0) return input.refusals[0]!;
  if (input.grantEnabled && input.reason.trim() === '') {
    return 'Say why this access is temporary. The reason goes in the audit log.';
  }
  if (!input.changed) return 'Change a branch or add temporary access to save.';
  return null;
}
