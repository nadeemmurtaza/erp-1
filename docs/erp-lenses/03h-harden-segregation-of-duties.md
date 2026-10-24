# 03h. Hardening record: Segregation of duties

Adversarial review of [03-segregation-of-duties.md](03-segregation-of-duties.md) by the `harden:03:segregation-of-duties` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The conflict matrix has no home  — strong

**Question:** Name the toxic permission-key pair this feature creates, and the file where that pair is checked at role-save time or nowhere.

**Verified against:** packages/shared/src/permissions.ts:38-43 (PermissionDefinition has no conflictsWith field, verified); roles.service.ts:60,91 (create/update, verified — only orphan/duplicate checks exist); purchasing.service.ts:242,289 (createPurchaseOrder/receiveGoods, verified)

### Detected at grant or at act  — strong

**Question:** State which one check exists for the toxic pair - a grant-time refusal in RolesService.create/.update or an act-time throw comparing actorId to a stored id - and where in the diff it lives.

**Verified against:** payments.service.ts:229,243 (approve/approvedById, verified); permissions.ts:83 (payments.approve, verified); corrected RolesService.assignRole (does not exist) to RolesService.create/.update

### Who counts the drawer they held  — strong

**Question:** Name the field that would prove a different person closed and reconciled a POS shift than the one who opened it, and say what closeShift/zReport actually compare today.

**Verified against:** pos-shifts.service.ts:32,55,72,103,107-131 (verified, one line-range split corrected); pos-shifts.controller.ts:17 (class-level pos.operate guard, verified); chart-of-accounts.ts:20 (1000 Cash & Bank, verified)

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- Lens 2 cited a nonexistent method `RolesService.assignRole` as a grant-time enforcement point; grepped roles.service.ts and confirmed the only methods that write a role's permissions array are `create` (line 60) and `update` (line 91) — corrected the file to cite those instead.
- Lens 3's worked example attributed both `expectedCashMinor` and `overShortMinor` to pos-shifts.service.ts:107-131; actually `expectedCashMinor` is computed inside the private `breakdown()` method at line 128 (within 107-131) while `overShortMinor` is computed separately in `zReport()` at line 103 — corrected to cite each at its real line.
