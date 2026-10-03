/**
 * The deciding functions behind the department-page specimen.
 *
 * A department is an `OrgUnit` (`org-structure.prisma`): a `code` and a `name`, a
 * parent, an `isActive` flag and a `closedAt`. Three things the mockup this page
 * came from drew as fields are not columns of a unit here, so the page does not
 * pretend they are:
 *
 *   - Where it works (a branch scope) is where it sits: its nearest office
 *     ancestor. Typing it a second time would store the same fact twice and
 *     let the two disagree, so it is derived and shown, and changes when the
 *     parent changes.
 *   - Its head is a post (`Position`), held by someone through a `Posting`. The
 *     reporting line lives on the post so a leaver does not sever the chain; the
 *     page shows who holds it and links to where that is changed.
 *   - It is closed, never deleted, because attendance rows, journal lines and
 *     completed tasks still point at it. So there is no active switch: closing
 *     is an action with refusals, in `closeBlockers`.
 *
 * The refusal strings are the ones `OrgUnitService` throws, in its own words. The
 * specimen predicts them; the server remains the authority.
 */

export interface Unit {
  id: string;
  name: string;
  parentId: string | null;
  /** `OrgUnitType.isOffice`: the kinds that stand for a place. */
  office: boolean;
  closed?: boolean;
}

export interface DepartmentDraft {
  name: string;
  code: string;
  parentId: string;
}

export type DepartmentField = 'name' | 'code' | 'parent';

const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A code to offer while the name is typed: lowercase words joined by hyphens.
 * Offered, never imposed: once a person edits the code themselves the name no
 * longer rewrites it (the screen tracks that), since a code that changes under
 * your hands breaks every import that named it.
 */
export function suggestCode(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** One message per broken field, each saying what to do. An absent key means the field is fine. */
export function departmentErrors(
  draft: DepartmentDraft,
  context: { takenCodes: readonly string[]; units: readonly Unit[] },
): Partial<Record<DepartmentField, string>> {
  const errors: Partial<Record<DepartmentField, string>> = {};

  if (draft.name.trim() === '') {
    errors.name = 'Give the department a name. It appears in the org chart and on every posting.';
  }

  if (draft.code.trim() === '') {
    errors.code = 'Give the department a code. Imports and links use it.';
  } else if (!CODE_PATTERN.test(draft.code)) {
    errors.code = 'Use lowercase letters, numbers and single hyphens, like finance-ops.';
  } else if (context.takenCodes.includes(draft.code)) {
    errors.code = `A unit with the code "${draft.code}" already exists in this brand. Choose another code.`;
  }

  if (draft.parentId === '') {
    errors.parent = 'Choose where this department sits. It inherits where it works from there.';
  } else if (context.units.find((unit) => unit.id === draft.parentId)?.closed) {
    errors.parent = 'That unit is closed and cannot receive a new child or move.';
  }
  return errors;
}

/** The unit and everything beneath it. A unit cannot be moved under itself, so these are never offered as a parent. */
export function descendantIds(units: readonly Unit[], rootId: string): string[] {
  const found = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const unit of units) {
      if (unit.parentId !== null && found.has(unit.parentId) && !found.has(unit.id)) {
        found.add(unit.id);
        grew = true;
      }
    }
  }
  return [...found];
}

/** Where a unit sits, root first, as names. Stops rather than loops if the data ever cycles. */
export function unitPath(units: readonly Unit[], id: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = units.find((unit) => unit.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId === null ? undefined : units.find((unit) => unit.id === current!.parentId);
  }
  return names;
}

/** The nearest office at or above a unit: where a department placed here is said to work. Null when none is above it. */
export function nearestOffice(units: readonly Unit[], id: string): Unit | null {
  const seen = new Set<string>();
  let current = units.find((unit) => unit.id === id);
  while (current && !seen.has(current.id)) {
    if (current.office) return current;
    seen.add(current.id);
    current = current.parentId === null ? undefined : units.find((unit) => unit.id === current!.parentId);
  }
  return null;
}

export interface CloseBlocker {
  /** Which screen fixes it: the org chart moves or closes units, People moves posts. */
  fix: 'units' | 'positions';
  message: string;
}

/** What stops a close, in the service's words with the plural handled. Empty means it may close. */
export function closeBlockers(unit: { openChildren: number; positions: number }): CloseBlocker[] {
  const reasons: CloseBlocker[] = [];
  if (unit.openChildren > 0) {
    reasons.push({
      fix: 'units',
      message:
        unit.openChildren === 1
          ? 'This unit still has 1 open child unit. Close or move it first.'
          : `This unit still has ${unit.openChildren} open child units. Close or move them first.`,
    });
  }
  if (unit.positions > 0) {
    reasons.push({
      fix: 'positions',
      message:
        unit.positions === 1
          ? 'This unit still holds 1 position. Move it to another unit first.'
          : `This unit still holds ${unit.positions} positions. Move them to another unit first.`,
    });
  }
  return reasons;
}
