# 03g generate segregation of duties

Output of the `gen:03:segregation-of-duties` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Segregation of duties

## File

docs/erp-lenses/03-segregation-of-duties.md

## Lenses

### The conflict matrix has no home

**Question:** Name the toxic permission-key pair this feature creates (which two capabilities must never sit in one grant), and the file where that pair is checked — at role-save time or nowhere.

**Grounding:** packages/shared/src/permissions.ts (PermissionDefinition has no conflictsWith field), apps/api/src/core/auth/roles.service.ts (only checks locked-permission orphaning and duplicate sets, never a pair), apps/api/src/modules/purchasing/purchasing.service.ts:242 createPurchaseOrder and :289 receiveGoods both gated by the single key purchasing.manage with no comparison of receivedById to the PO's createdById

### Detected at grant or at act

**Question:** For this feature's toxic pair, state which enforcement exists — a grant-time check refusing the role assignment, or an act-time check comparing the actor to a stored id — and where in the diff it lives.

**Grounding:** apps/api/src/modules/payments/payments.service.ts:229 approve(actorId, paymentId) stamps approvedById but never reads order.placedById or compares to any prior actor; packages/shared/src/permissions.ts:83 payments.approve is a flat key under PermissionsGuard's pure-OR check

### Who counts the drawer they held

**Question:** Name the field that would prove a different person closed and reconciled a POS shift than the one who opened it and moved its cash, and say what closeShift/zReport actually compare today.

**Grounding:** apps/api/src/modules/pos/pos-shifts.service.ts:32 openShift and :72 closeShift never compare closedByUserId to shift.openedByUserId; recordCashMovement accepts any actorId; packages/shared/src/permissions.ts:77 pos.operate is one key covering open, cash movement, and close

## Absences

- No conflictsWith/mutuallyExclusiveWith field on PermissionDefinition or any toxic-pair table
- No maker-checker field anywhere — no approvedById/receivedById/closedByUserId is ever compared against the actor who created the record it acts on
- No distinct permission key separating create from receive/approve within one object (purchasing.manage and pos.operate each cover both ends)
- No rank/amount-banded approval ceiling to attach an SoD rule to — payments.approve is a boolean and no rank/grade model exists

