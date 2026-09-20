# 04h. Hardening record: Approval chains, escalation and delegation

Adversarial review of [04-approval-delegation.md](04-approval-delegation.md) by the `harden:04:approval-delegation` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The threshold nobody approves alone  — strong

**Question:** Name the amount bands per document type (PurchaseOrder, SupplierBill, INVOICED inter-branch transfer, StockVariance write-off, JournalEntry), the role/rank per band, the quorum on the top band, and the service method where the check runs before the row leaves DRAFT.

**Verified against:** packages/shared/src/permissions.ts:83 (payments.approve, verified sole approval-shaped key of 50 total, confirmed by grep -c), purchasing.prisma:88-94 (PurchaseOrderStatus enum verified exactly DRAFT|SENT|PARTIAL|RECEIVED|CANCELLED, no PENDING_APPROVAL), guards.ts PermissionsGuard.canActivate verified as .some() OR over held keys

### Acting cover has no clock  — strong

**Question:** Name the table recording that user B may act with user A's authority from date X to Y, and what removes that authority at Y+1 without manual follow-up.

**Verified against:** core.prisma:278-346 (UserPermission, RoleGrant, UserRoleAssignment verified to carry only createdAt, no expiresAt), organization.prisma:106 (AdminScope verified, only createdAt), expiresAt confirmed present only on Cart/RefreshToken/PasswordResetToken/EmailVerificationToken via grep across schema

### The approval orphaned by a leaver  — strong

**Question:** Name the query listing every pending approval sitting with a given user, and the call site inside the isActive-deactivation flow that reassigns or escalates them.

**Verified against:** auth.service.ts:135 and :158 verified exact (isActive checks in login and refresh), jwt.strategy.ts:35 verified exact (isActive check in validate()), users-admin.service.ts confirmed to set isActive via dto.isActive with no reassignment logic, confirmed no Approval/ApprovalStep model or PENDING_APPROVAL status exists anywhere in prisma schema

## Killed (0)

_Nothing was killed._


## Citations corrected (0)

_Every citation checked out as written._


## Not modelled in this repo today

- No changes made to the file — every citation checked (permissions.ts:83, purchasing.prisma:88-94, core.prisma:278-346, organization.prisma:106, auth.service.ts:135/158, jwt.strategy.ts:35, users-admin.service.ts, PermissionsGuard.canActivate, AdminScopeLevel enum, the '50-entry catalogue' count, and the four-model expiresAt claim) verified accurate against the repository as it stands. All three lenses are distinct from the five CLAUDE.md lenses and the 30 prior WO-22 lenses, demand checkable artifacts, and name concrete corporate-scale failure consequences. No Hardening record was appended since nothing was killed or corrected — the file was left unmodified rather than padded with a no-op section.
