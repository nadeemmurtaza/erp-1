# 51g generate gap

Output of the `gen:gap:51` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The approval that stalls without a leaver

## File

docs/erp-lenses/51-gap-the-approval-that-stalls-without-a-leave.md

## Lenses

### The clock nobody starts

**Question:** For a pending approval step assigned to a still-active user, name the timestamp that marks when its clock starts, the cron or interval job that scans for steps older than a configured threshold, and the Settings key holding that threshold per document type.

**Grounding:** apps/api/src/modules/marketing/marketing-automation.cron.ts (MarketingAutomationCron, the one real idle-timer precedent in this codebase); settings.defaults.ts:118/120 (MarketingAbandonedCartReminderHours/IncentiveHours); confirmed via grep that no Approval/ApprovalStep model or PENDING_APPROVAL status exists in any .prisma file, so there is no assignedAt column to measure against yet

### Store time is not the approver's time

**Question:** Name the field carrying one actor's own timezone (not the deployment's), and what a reminder/escalation timer computes '24 hours elapsed' against when the named approver sits in a different zone than that deployment-wide value.

**Grounding:** settings.defaults.ts:63/149 (SettingKey.StoreTimezone, a single row on the global Setting table, core.prisma:153); core.prisma:11 User model, confirmed to carry no timezone column; ground brief's Org silhouette naming '100+ Locations... across timezones'

### Acted on, not delivered

**Question:** Name the query that tells the escalation job an approver has acted on a step, versus the query that tells it a reminder was merely sent, and what the escalation rule does when the second is true and the first never becomes true.

**Grounding:** grep across all .prisma files for model.*Log|model.*Delivery|model.*Notification returns only AuditLog; NotificationsService (called by MarketingAutomationCron) is fire-and-forget with no delivery/read tracking

## Absences

- No Approval or ApprovalStep model, no PENDING_APPROVAL-shaped status on any document, and so no assignedAt column for a cron to measure age against (same absence lens 04 already names)
- No @Cron/@Interval job anywhere ages a pending decision - the only idle-timer precedent (MarketingAutomationCron) acts on Cart/Order, never an approval
- No per-user timezone column on User; SettingKey.StoreTimezone is a single deployment-wide value with no user, branch or location override
- No delivery or read tracking of any kind (no EmailLog, NotificationLog or Delivery model) - nothing distinguishes 'sent' from 'acted on' for any notification, approval reminders included

