# 46g generate gap

Output of the `gen:gap:46` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Quorum/dual-custody/second-signature controls that assume the deployment's roster can supply the required distinct second person

## File

docs/erp-lenses/gap-46/46-gap-no-lens-asks-what-a-quorum-dual-custody-.md

## Lenses

### The quorum of one

**Question:** For Ruling 6's abandoned-PosShift close and for the top-band quorum in 'The threshold nobody approves alone' (04), name the fallback state a control moves to when the deployment's live roster has fewer distinct qualified holders than the control requires, the field recording that this was a shortfall pass rather than a genuine quorum pass, and the permission key that authorises invoking it.

**Grounding:** apps/api/prisma/schema/pos.prisma:52-55 (PosShiftStatus has only OPEN/CLOSED, no ABANDONED state exists); apps/api/prisma/schema/purchasing.prisma:88-94 (PurchaseOrderStatus has no approval-gate status); apps/api/src/modules/sales/pos/pos-shifts.service.ts:35-36,72 (openShift throws on any non-ACTIVE terminal, closeShift has no second-holder logic)

### The count nobody keeps

**Question:** For any permission key a quorum or dual-custody control will require two or more distinct holders of, name the service method that returns how many distinct users currently hold that key deployment-wide today - and if none exists, name the nearest check that comes close and what it actually verifies instead.

**Grounding:** apps/api/src/core/auth/roles.service.ts:261 (assertLockedPermissionsStillHeldSomewhere, called from role edit at :109 and role delete at :139) and :175 (assertLockedKeysStillHeldAfterRevoke) - both only check for zero holders of ADMIN_LOCKED_PERMISSIONS, never a threshold above one

### The record that must outlive its own excuse

**Question:** When a fallback single-approver pass is recorded because the roster couldn't supply a control's second signer, name the column storing how many qualified holders actually existed at that moment, and what a report run after the deployment's roster has grown past that number does with rows still carrying the old justification.

**Grounding:** R14 (edition upgrade is never a migration, tier concepts stay invisible until they apply); absence confirmed - no Approval/ApprovalStep model in apps/api/prisma/schema/*.prisma, JournalEntry has no postedByUserId or approval state

## Absences

- No ABANDONED (or equivalent) status on PosShiftStatus - only OPEN/CLOSED exist (pos.prisma:52-55); Ruling 6's own fallback state is a ruling, not code.
- No approval-gate status on PurchaseOrderStatus (DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED, purchasing.prisma:88-94) - the top-band quorum ladder has nowhere to attach yet.
- No method anywhere that counts distinct holders of a permission key - RolesService checks only for zero holders of ADMIN_LOCKED_PERMISSIONS.
- No Approval/ApprovalStep model, and no column on any model recording the roster size in force at the time of an approval.

