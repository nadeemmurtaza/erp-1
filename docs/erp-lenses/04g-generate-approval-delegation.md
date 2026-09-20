# 04g generate approval delegation

Output of the `gen:04:approval-delegation` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Approval chains, escalation and delegation

## File

docs/erp-lenses/04-approval-delegation.md

## Lenses

### The threshold nobody approves alone

**Question:** For each document type that commits money or stock at a value (PurchaseOrder, SupplierBill, an INVOICED inter-branch transfer, a StockVariance write-off, a manual JournalEntry), name the amount bands, which role/rank each band requires, how many distinct approvers the top band needs (quorum), and the service method where that check runs before the row leaves its draft state.

**Grounding:** packages/shared/src/permissions.ts:83 (payments.approve, flat boolean, only approval-shaped key in the 50-key catalogue); PermissionsGuard.canActivate is a pure OR; purchasing.prisma:88-94 PurchaseOrderStatus = DRAFT|SENT|PARTIAL|RECEIVED|CANCELLED, no PENDING_APPROVAL value.

### Acting cover has no clock

**Question:** Name the table that records "user B may act with user A's approval authority from date X to date Y," and what removes that authority at the start of day Y+1 if nobody remembers to.

**Grounding:** core.prisma:278-346 (RoleGrant, UserRoleAssignment, UserPermission) and organization.prisma:106 (AdminScope) each have only createdAt; grep confirms expiresAt exists in this schema only on Cart, RefreshToken, PasswordResetToken, EmailVerificationToken -- never on a grant table.

### The approval orphaned by a leaver

**Question:** Name the query that lists every not-yet-decided approval currently sitting with a given user, and the call site -- inside whatever flips that user's isActive to false -- that reassigns or escalates them.

**Grounding:** auth.service.ts:135,158 and jwt.strategy.ts:35 gate login on user.isActive; no Approval/ApprovalStep model exists in any .prisma file; PurchaseOrderStatus has no PENDING_APPROVAL state; users-admin.service.ts is where isActive is flipped, with no downstream reassignment logic.

## Absences

- No Approval or ApprovalStep model, and no PENDING_APPROVAL-shaped status on any document (PurchaseOrder, SupplierBill, InterBranchInvoice, StockTransfer)
- No amount-band or threshold table anywhere -- no ceiling, tier or quorum concept attaches to any permission key or document
- No delegation table and no expiresAt/grantedBy column on RoleGrant, UserRoleAssignment, UserPermission or AdminScope
- No reassignment-on-deactivation path: isActive: false blocks login but nothing reads it to move work off a user
- No rank or manager/reports-to model -- escalation has no ladder to climb beyond the three-value AdminScopeLevel (ORG/BRAND/BRANCH)

