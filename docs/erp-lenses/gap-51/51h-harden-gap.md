# 51h harden gap

Output of the `harden:gap:51` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The approval that stalls without a leaver

## File

docs/erp-lenses/gap-51/51-gap-the-approval-that-stalls-without-a-leave.md

## Kept

### The clock nobody starts

**Question:** For a pending approval step assigned to a still-active user, name the timestamp marking clock start, the cron/interval job scanning for aged steps, and the Settings key holding the threshold per document type.

**Citations:** MarketingAutomationCron (apps/api/src/modules/marketing/marketing-automation.cron.ts, @Cron('0 3 * * *')) verified as the only idle-timer precedent; grep confirms no model Approval/ApprovalStep/PENDING_APPROVAL anywhere in .prisma

**Strength:** strong

### Store time is not the approver's time

**Question:** Name the field carrying one actor's own timezone (not the deployment's), and what the reminder/escalation timer computes '9am'/'24 hours elapsed' against when the approver sits in a different zone.

**Citations:** SettingKey.StoreTimezone (settings.defaults.ts:63, defaulted line 149 to BRAND.locale.timeZone); Setting model (core.prisma:153) has no user/branch column; User (core.prisma:11) has no timezone field

**Strength:** solid

### Acted on, not delivered

**Question:** Name the query telling the escalation job an approver has acted on a step vs. the query telling it a reminder was merely sent, and what the escalation rule does when only the second is true.

**Citations:** No model.*Log/Delivery/Notification exists besides AuditLog (core.prisma:220); NotificationsService is fire-and-forget. Rewritten to explicitly differentiate from WO-22's 'Delivery is a fact, not a hope' (that lens builds delivery-tracking infra; this one forbids the escalation trigger from depending on such infra existing at all)

**Strength:** marginal

## Killed

## Corrections

- "Acted on, not delivered" originally cited the same fire-and-forget NotificationsService fact as the existing WO-22 Notifications lens "Delivery is a fact, not a hope" without stating a difference — a restatement risk. Not a wrong citation, but corrected by rewriting the lens's "Why" to name that lens explicitly and state the one-clause distinction (delivery-tracking infrastructure vs. an escalation-trigger rule that must not depend on it), so it survives rather than being killed as a duplicate.

