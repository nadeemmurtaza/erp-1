import {
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  ROLE_PERMISSION_SEED,
  ADMIN_LOCKED_PERMISSIONS,
} from './permissions';

describe('PERMISSION_CATALOG', () => {
  it('every key is unique', () => {
    const seen = new Set(PERMISSION_KEYS);
    expect(seen.size).toBe(PERMISSION_KEYS.length);
  });

  it('every entry carries a sensitivity', () => {
    for (const permission of PERMISSION_CATALOG) {
      expect(['low', 'medium', 'high', 'critical']).toContain(permission.sensitivity);
    }
  });

  it('every ADMIN_LOCKED_PERMISSIONS key is marked critical — the wizard warning and the actual guard must agree', () => {
    for (const key of ADMIN_LOCKED_PERMISSIONS) {
      const permission = PERMISSION_CATALOG.find((p) => p.key === key);
      expect(permission?.sensitivity).toBe('critical');
    }
  });

  it('every ROLE_PERMISSION_SEED key exists in the catalog', () => {
    for (const keys of Object.values(ROLE_PERMISSION_SEED)) {
      for (const key of keys) {
        expect(PERMISSION_KEYS).toContain(key);
      }
    }
  });
});

describe('PERMISSION_GROUPS — the role-creation wizard\'s steps', () => {
  it('every catalog key appears in exactly one group — no permission left off the wizard, none listed twice', () => {
    const seen = new Map<string, string>();
    for (const group of PERMISSION_GROUPS) {
      for (const key of group.permissions) {
        expect(seen.has(key)).toBe(false);
        seen.set(key, group.key);
      }
    }
    expect([...seen.keys()].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('every permission named in a group is a real catalog key — no typo silently drops a permission', () => {
    for (const group of PERMISSION_GROUPS) {
      for (const key of group.permissions) {
        expect(PERMISSION_KEYS).toContain(key);
      }
    }
  });

  it('every group has at least one permission', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(group.permissions.length).toBeGreaterThan(0);
    }
  });

  it('group keys are unique', () => {
    const keys = PERMISSION_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
