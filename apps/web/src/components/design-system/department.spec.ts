import {
  closeBlockers,
  departmentErrors,
  descendantIds,
  nearestOffice,
  suggestCode,
  unitPath,
  type DepartmentDraft,
  type Unit,
} from './department';

const units: Unit[] = [
  { id: 'ho', name: 'Head office', parentId: null, office: true },
  { id: 'lhr', name: 'Lahore branch', parentId: 'ho', office: true },
  { id: 'khi', name: 'Karachi branch', parentId: 'ho', office: true },
  { id: 'mux', name: 'Multan branch', parentId: 'ho', office: true, closed: true },
  { id: 'fin', name: 'Finance', parentId: 'lhr', office: false },
  { id: 'ops', name: 'Finance operations', parentId: 'fin', office: false },
];
const draft: DepartmentDraft = { name: 'Finance operations', code: 'finance-ops', parentId: 'lhr' };
const context = { takenCodes: ['hr'], units };

describe('suggestCode', () => {
  it('joins lowercase words with single hyphens', () => {
    expect(suggestCode('Finance Operations')).toBe('finance-operations');
  });

  it('drops punctuation, accents and the edges, and collapses runs', () => {
    expect(suggestCode('  Café & Catering -- (North)  ')).toBe('cafe-catering-north');
  });

  it('returns an empty string for a name with nothing to say, so the code field stays empty', () => {
    expect(suggestCode('   ')).toBe('');
    expect(suggestCode('!!!')).toBe('');
  });

  it('produces a code the code rule itself accepts', () => {
    const code = suggestCode('Head Office / IT & Support');
    expect(departmentErrors({ ...draft, code }, context).code).toBeUndefined();
  });
});

describe('departmentErrors', () => {
  it('finds nothing wrong with a complete draft', () => {
    expect(departmentErrors(draft, context)).toEqual({});
  });

  it('asks for a name, and treats only spaces as no name', () => {
    expect(departmentErrors({ ...draft, name: '   ' }, context).name).toMatch(/Give the department a name/);
  });

  it('asks for a code and says what a valid one looks like', () => {
    expect(departmentErrors({ ...draft, code: '' }, context).code).toMatch(/Give the department a code/);
    expect(departmentErrors({ ...draft, code: 'Finance Ops' }, context).code).toMatch(/lowercase letters/);
    expect(departmentErrors({ ...draft, code: 'finance--ops' }, context).code).toMatch(/single hyphens/);
    expect(departmentErrors({ ...draft, code: '-finance' }, context).code).toMatch(/lowercase letters/);
  });

  it('refuses a code another unit in the brand already holds, naming it', () => {
    expect(departmentErrors({ ...draft, code: 'hr' }, context).code).toBe(
      'A unit with the code "hr" already exists in this brand. Choose another code.',
    );
  });

  it('refuses to place a department under a closed unit, in the service’s words', () => {
    expect(departmentErrors({ ...draft, parentId: 'mux' }, context).parent).toBe(
      'That unit is closed and cannot receive a new child or move.',
    );
  });

  it('asks where a new department sits instead of leaving it at the top of the chart', () => {
    expect(departmentErrors({ ...draft, parentId: '' }, context).parent).toMatch(/Choose where this department sits/);
  });

  it('reports every broken field at once instead of one per attempt', () => {
    expect(Object.keys(departmentErrors({ name: '', code: '', parentId: 'mux' }, context))).toEqual([
      'name',
      'code',
      'parent',
    ]);
  });
});

describe('descendantIds', () => {
  it('includes the unit itself and everything beneath it, however deep', () => {
    expect(descendantIds(units, 'lhr').sort()).toEqual(['fin', 'lhr', 'ops']);
  });

  it('is just the unit for a leaf', () => {
    expect(descendantIds(units, 'ops')).toEqual(['ops']);
  });

  it('terminates on data that cycles, instead of hanging the page', () => {
    const cyclic: Unit[] = [
      { id: 'a', name: 'A', parentId: 'b', office: false },
      { id: 'b', name: 'B', parentId: 'a', office: false },
    ];
    expect(descendantIds(cyclic, 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('unitPath', () => {
  it('lists names from the root down to the unit', () => {
    expect(unitPath(units, 'ops')).toEqual(['Head office', 'Lahore branch', 'Finance', 'Finance operations']);
  });

  it('is empty for an id that does not exist, and stops on a cycle', () => {
    expect(unitPath(units, 'nope')).toEqual([]);
    const cyclic: Unit[] = [
      { id: 'a', name: 'A', parentId: 'b', office: false },
      { id: 'b', name: 'B', parentId: 'a', office: false },
    ];
    expect(unitPath(cyclic, 'a')).toEqual(['B', 'A']);
  });
});

describe('nearestOffice', () => {
  it('is the unit itself when it is an office', () => {
    expect(nearestOffice(units, 'lhr')?.name).toBe('Lahore branch');
  });

  it('walks up past departments to the office that holds them', () => {
    expect(nearestOffice(units, 'ops')?.name).toBe('Lahore branch');
  });

  it('follows the parent: moving a department changes where it works', () => {
    expect(nearestOffice(units, 'khi')?.name).toBe('Karachi branch');
  });

  it('is null when no office is above, so the screen must say what that means', () => {
    expect(nearestOffice([{ id: 'x', name: 'X', parentId: null, office: false }], 'x')).toBeNull();
  });
});

describe('closeBlockers', () => {
  it('lets an empty unit close', () => {
    expect(closeBlockers({ openChildren: 0, positions: 0 })).toEqual([]);
  });

  it('names open children and held positions, each with what to do first and the screen that does it', () => {
    expect(closeBlockers({ openChildren: 2, positions: 3 })).toEqual([
      { fix: 'units', message: 'This unit still has 2 open child units. Close or move them first.' },
      { fix: 'positions', message: 'This unit still holds 3 positions. Move them to another unit first.' },
    ]);
  });

  it('uses the singular for exactly one', () => {
    expect(closeBlockers({ openChildren: 1, positions: 1 }).map((b) => b.message)).toEqual([
      'This unit still has 1 open child unit. Close or move it first.',
      'This unit still holds 1 position. Move it to another unit first.',
    ]);
  });

  it('reports only the blocker that applies', () => {
    expect(closeBlockers({ openChildren: 0, positions: 4 })).toHaveLength(1);
  });
});
