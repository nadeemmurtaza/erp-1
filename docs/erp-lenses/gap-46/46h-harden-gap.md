# 46h harden gap

Output of the `harden:gap:46` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

No lens asks what a quorum/dual-custody/second-signature control does when the deployment's roster can't supply the second person

## File

docs/erp-lenses/gap-46/46-gap-no-lens-asks-what-a-quorum-dual-custody-.md

## Kept

### The quorum of one

**Question:** Name the fallback status a quorum/dual-custody control moves to when the live roster has fewer qualified holders than required, the field recording it was a shortfall pass, and the permission key gating it.

**Citations:** PosShiftStatus has only OPEN/CLOSED (pos.prisma:52-55); closeShift() at pos-shifts.service.ts:72; openShift()'s ACTIVE check at :35-36 — all verified.

**Strength:** strong

### The count nobody keeps

**Question:** Name the service method that returns how many distinct users hold a given permission key deployment-wide, or the nearest check that comes close and what it actually verifies instead.

**Citations:** roles.service.ts:261 (assertLockedPermissionsStillHeldSomewhere) and :175 (assertLockedKeysStillHeldAfterRevoke) verified to check only for zero holders of ADMIN_LOCKED_PERMISSIONS, never a threshold.

**Strength:** strong

### The record that must outlive its own excuse

**Question:** Name the column storing how many qualified holders existed when a fallback single-approver pass was recorded, and what a later report does with rows carrying that old justification once the roster has grown.

**Citations:** JournalEntry (accounting.prisma:120-140) has no approval/actor column; no Approval/ApprovalStep model exists anywhere in the schema — both confirmed absent.

**Strength:** solid

## Killed

## Corrections

- Cited the version-stamp comparison lens as local file "(19)" using this catalogue's own docs/erp-lenses/NN-*.md numbering; no file 19 is about version stamps (19-channels-franchise-wholesale.md is unrelated). Corrected to point directly at docs/implementation/WO-22-lens-workflow-results.md:279, where 'The version stamp' actually lives as the 19th lens in that document's separate list.
- pos-shifts.service.ts was cited by bare filename with no path in the lens bodies; confirmed the real path is apps/api/src/modules/sales/pos/pos-shifts.service.ts (not apps/api/src/pos/...). Line numbers (closeShift:72, ACTIVE check:35-36) matched exactly, so this was an incomplete citation rather than a wrong one — filled in the full path in the appended Hardening record.

## Absences

- No ABANDONED (or equivalent) status on PosShiftStatus — confirmed only OPEN/CLOSED exist.
- No approval-gate status on PurchaseOrderStatus — confirmed enum is DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED with no gate.
- No method anywhere counts distinct holders of a permission key against a quorum threshold — confirmed RolesService only checks for zero.
- No Approval/ApprovalStep model and no roster-size column on any model — confirmed absent from the full prisma schema.

