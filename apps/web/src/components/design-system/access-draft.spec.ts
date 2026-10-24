import {
  EMPTY_GRANT,
  GRANT_PRESETS,
  MAX_GRANT_DAYS,
  countersignCandidates,
  endsSoon,
  formatRemaining,
  grantEndsAt,
  grantRefusals,
  saveBlocker,
  scopeDiff,
  type GrantDraft,
  type Person,
} from './access-draft';

const people: Person[] = [
  { id: 'cashier', name: 'Cashier', email: 'c@example.com', role: 'Cashier', scopes: ['Lahore'], rank: 1 },
  { id: 'manager', name: 'Manager', email: 'm@example.com', role: 'Branch manager', scopes: ['Lahore'], rank: 3 },
  { id: 'peer', name: 'Peer', email: 'p@example.com', role: 'Cashier', scopes: ['Karachi'], rank: 1 },
  { id: 'director', name: 'Director', email: 'd@example.com', role: 'Director', scopes: [], rank: 5 },
];
const recipient = people[0]!;
const on = (patch: Partial<GrantDraft> = {}): GrantDraft => ({ ...EMPTY_GRANT, enabled: true, ...patch });

describe('grantEndsAt', () => {
  it('lands on an absolute instant the stated number of days later', () => {
    const start = new Date('2026-10-01T09:00:00Z');
    expect(grantEndsAt(start, 7).toISOString()).toBe('2026-10-08T09:00:00.000Z');
  });

  it('does not mutate the date it was given', () => {
    const start = new Date('2026-10-01T09:00:00Z');
    grantEndsAt(start, 30);
    expect(start.toISOString()).toBe('2026-10-01T09:00:00.000Z');
  });
});

describe('grantRefusals', () => {
  it('refuses nothing while the grant is not being issued, even with bad values in the draft', () => {
    expect(grantRefusals({ ...EMPTY_GRANT, enabled: false, days: 999, mode: 'ACTING' }, recipient, people)).toEqual([]);
  });

  it('accepts a view-only grant inside the limit', () => {
    expect(grantRefusals(on({ days: 7 }), recipient, people)).toEqual([]);
  });

  it('accepts exactly the longest allowed grant and refuses one day more (boundary)', () => {
    expect(grantRefusals(on({ days: MAX_GRANT_DAYS }), recipient, people)).toEqual([]);
    expect(grantRefusals(on({ days: MAX_GRANT_DAYS + 1 }), recipient, people)[0]).toMatch(
      /cannot run longer than 14 days/,
    );
  });

  it('refuses the thirty-day preset because the limit is lower, so the preset needs a reason shown', () => {
    const thirty = GRANT_PRESETS.find((p) => p.days === 30)!;
    expect(thirty.days).toBeGreaterThan(MAX_GRANT_DAYS);
    expect(grantRefusals(on({ days: thirty.days }), recipient, people)).toHaveLength(1);
  });

  it('needs a countersigner for an acting grant', () => {
    expect(grantRefusals(on({ mode: 'ACTING' }), recipient, people)[0]).toMatch(/needs a countersignature/);
  });

  it('refuses a countersigner of the same rank, or one who does not exist', () => {
    expect(grantRefusals(on({ mode: 'ACTING', countersignerId: 'peer' }), recipient, people)[0]).toMatch(
      /does not outrank/,
    );
    expect(grantRefusals(on({ mode: 'ACTING', countersignerId: 'nobody' }), recipient, people)[0]).toMatch(
      /does not outrank/,
    );
  });

  it('accepts a countersigner who outranks the recipient', () => {
    expect(grantRefusals(on({ mode: 'ACTING', countersignerId: 'manager' }), recipient, people)).toEqual([]);
  });

  it('reports both problems at once when both apply', () => {
    expect(grantRefusals(on({ mode: 'ACTING', days: 99 }), recipient, people)).toHaveLength(2);
  });
});

describe('countersignCandidates', () => {
  it('lists only people who strictly outrank the recipient, never the recipient or a peer', () => {
    expect(countersignCandidates(recipient, people).map((p) => p.id)).toEqual(['manager', 'director']);
  });

  it('is empty at the top of the ladder, so the screen must say nobody can countersign', () => {
    expect(countersignCandidates(people[3]!, people)).toEqual([]);
  });
});

describe('scopeDiff', () => {
  it('names what was added and what was removed, and nothing for what stayed', () => {
    expect(scopeDiff(['Lahore', 'Karachi'], ['Karachi', 'Multan'])).toEqual({ added: ['Multan'], removed: ['Lahore'] });
  });

  it('is empty both ways when nothing changed, whatever the order', () => {
    expect(scopeDiff(['Lahore', 'Karachi'], ['Karachi', 'Lahore'])).toEqual({ added: [], removed: [] });
  });
});

describe('saveBlocker', () => {
  const ok = { selfEdit: false, refusals: [], grantEnabled: false, reason: '', changed: true };

  it('lets a real change save', () => {
    expect(saveBlocker(ok)).toBeNull();
  });

  it('puts "you cannot do this at all" before everything else', () => {
    expect(saveBlocker({ ...ok, selfEdit: true, refusals: ['x'], changed: false })).toMatch(/your own access/);
  });

  it('shows what the server would refuse before what is merely missing', () => {
    expect(
      saveBlocker({ ...ok, refusals: ['A grant cannot run longer than 14 days from now.'], grantEnabled: true }),
    ).toMatch(/cannot run longer/);
  });

  it('asks for a reason when temporary access is on and the reason is blank or only spaces', () => {
    expect(saveBlocker({ ...ok, grantEnabled: true, reason: '   ' })).toMatch(/audit log/);
    expect(saveBlocker({ ...ok, grantEnabled: true, reason: 'Covering leave' })).toBeNull();
  });

  it('says there is nothing to save instead of staying silent', () => {
    expect(saveBlocker({ ...ok, changed: false })).toMatch(/Change a branch/);
  });
});

describe('formatRemaining', () => {
  const H = 3_600_000;
  const D = 24 * H;
  it('speaks in days and hours while there are days left', () => {
    expect(formatRemaining(D + 4 * H)).toBe('1 d 4 h');
    expect(formatRemaining(3 * D)).toBe('3 d');
  });

  it('speaks in hours and minutes under a day, and drops a zero part', () => {
    expect(formatRemaining(5 * H + 30 * 60_000)).toBe('5 h 30 min');
    expect(formatRemaining(2 * H)).toBe('2 h');
  });

  it('rounds the last minute up, so it never reads 0 min while time is left', () => {
    expect(formatRemaining(42 * 60_000)).toBe('42 min');
    expect(formatRemaining(10_000)).toBe('1 min');
  });

  it('says ended at or past the end', () => {
    expect(formatRemaining(0)).toBe('ended');
    expect(formatRemaining(-5)).toBe('ended');
  });
});

describe('endsSoon', () => {
  it('flips at exactly one hour', () => {
    expect(endsSoon(3_600_000 - 1)).toBe(true);
    expect(endsSoon(3_600_000)).toBe(false);
  });
});
