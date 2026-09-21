# 51. The approval that stalls without a leaver

Lens 04 covers two edge cases: a leaver whose `isActive` flips false, and a
delegation window with a stamped end date. Neither covers the ordinary case
— a healthy, correctly-scoped approver who simply isn't acting: on leave
with no delegate set, in a timezone the reminder never reaches at a working
hour, or one missed email. SAP Business Workflow, Dynamics approvals and
Oracle EBS's engine all ship a reminder-then-escalate timer that runs
regardless of the leaver condition, because inaction is the common failure,
not departure.

## Lens: The clock nobody starts

**Question:** For a pending approval step assigned to a still-active user,
name the timestamp that marks when its clock starts, the cron or interval
job that scans for steps older than a configured threshold, and the
Settings key holding that threshold per document type.

**Why:** `MarketingAutomationCron`
(`apps/api/src/modules/marketing/marketing-automation.cron.ts`) is the one
precedent in this codebase for an idle timer the system acts on
unprompted: `SettingKey.MarketingAbandonedCartReminderHours` fires a
reminder, and `MarketingAbandonedCartIncentiveHours`
(`settings.defaults.ts:117-120`) fires a follow-up if nothing changed. No
equivalent exists for approvals — grep for `PENDING_APPROVAL`,
`ApprovalStep` or `model Approval` across every `.prisma` file returns
nothing, so even once lens 04's threshold ladder ships, there is no
`assignedAt` column anywhere for a cron to measure against. This differs
from 04's "Acting cover has no clock," which times a delegation window
between two named people; this lens times one step against nobody, whether
or not a delegate exists.

**Worked example:** Narrow slice: ship 04's threshold ladder and
reassignment-on-deactivation only. Complete capability: an
`ApprovalStep.assignedAt`, a `@Cron` job modelled on
`MarketingAutomationCron` that scans steps where `now() - assignedAt`
exceeds a per-document-type pair of `SettingKey`s (a reminder hours value,
then an escalate hours value), sends one reminder, and on the second
breach reassigns the step up the same `AdminScope` chain lens 04's third
lens already names.

**Done test:** Grep shows a `@Cron`/`@Interval` job reading an approval
step's age against two `SettingKey`s. A spec asserts a step older than the
escalate threshold gets a new owner or an explicit escalation record with
no human triggering it.

**Breaks without:** A 2,000,000 purchase order sits `PENDING_APPROVAL`
against a healthy, correctly-scoped regional lead on three weeks' leave
with no delegate configured. Lens 04's reassignment never fires because
`isActive` stays true, and the branch cannot receive stock it already
committed to buy.

## Lens: Store time is not the approver's time

**Question:** Name the field carrying one actor's own timezone — not the
deployment's — and what a reminder or escalation timer computes "9am" or
"24 hours elapsed" against when the named approver sits in a different
zone than that deployment-wide value.

**Why:** `SettingKey.StoreTimezone` (`settings.defaults.ts:63`, "IANA zone
the shop trades in") is the only timezone in the system: one row on the
single global `Setting` table (`core.prisma:153`, no user, branch or
location column), and `User` (`core.prisma:11`) carries no timezone field
at all. The ground brief's own Org silhouette names "100+ Locations...
across timezones" as a simultaneous requirement. A timer built against
`store.timezone` fires every approver's reminder and escalation clock at
the same wall-clock moment regardless of where they sit.

**Worked example:** Narrow slice: fire the previous lens's reminder cron
at `store.timezone`'s 9am for every recipient. Complete capability: an
approver-scoped timezone — a `User.timezone` column, or one resolved from
the `Location`/`AdminScope` the step's document sits under — that both the
reminder send-time and the escalate-after-N-hours window resolve against,
so "24 hours" means 24 working hours where the approver actually is.

**Done test:** Grep for `timezone` on the `User` model returns nothing
today; the PR must add the column, or a documented resolution path, and
show the escalation query reading it instead of `SettingKey.StoreTimezone`
alone.

**Breaks without:** An area manager three zones east of head office is
escalated past at 6am their time, for a step nobody surfaced to them
during a single working hour — the "missed email" this domain names
recurs every cycle because the clock was never running on their day.

## Lens: Acted on, not delivered

**Question:** Name the query that tells the escalation job an approver has
acted on a step, versus the query that tells it a reminder was merely
sent, and what the escalation rule does when the second is true and the
first never becomes true.

**Why:** Distinct from the WO-22 Notifications lens "Delivery is a fact, not
a hope": that lens says build a `Delivery` row so any feature can query
whether a message reached someone. This lens says the opposite for
approvals specifically — the escalation *trigger* must never be built to
require that infrastructure, delivered or not, because a delivered,
opened, read reminder still is not a decision. `NotificationsService`, the
same sender `MarketingAutomationCron` calls, is fire-and-forget today, so a
narrow build of the first lens's clock could mark a step "reminded" the
instant `send()` returns and treat that as handled — the wrong coupling
even after lens 22 ships.

**Worked example:** Narrow slice: the reminder cron sets a `remindedAt`
timestamp on send and treats that as handled. Complete capability:
`remindedAt` records only that a message was dispatched; the escalation
rule triggers off `ApprovalStep.status` still being `PENDING` past the
escalate threshold, regardless of how many reminders went out or whether
the transport reported success.

**Done test:** A spec sends the reminder, simulates the approver never
acting (mail bounced, filtered, or simply ignored), advances the clock
past the escalate threshold, and asserts the step reassigns anyway — send
success or failure changes nothing about the escalation decision.

**Breaks without:** An approver's inbox rule silently archives the
reminder. The send succeeded from the system's point of view, so a
narrow build that treats "sent" as "handled" never escalates, and the
pending transfer sits invisible exactly like the leaver case lens 04
already fixed — except this time the person is still there and would
have acted, had anyone told them twice.

## Not modelled yet

- No `Approval` or `ApprovalStep` model, no `PENDING_APPROVAL`-shaped
  status on any document, and so no `assignedAt` column for a cron to
  measure age against (the same absence lens 04 already names, load-
  bearing here too).
- No `@Cron`/`@Interval` job anywhere ages a pending decision — the only
  idle-timer precedent in the codebase is `MarketingAutomationCron`'s
  abandoned-cart and replenishment reminders, and it acts on a `Cart` or
  `Order`, never an approval.
- No per-user timezone: `User` carries none, and the single
  `SettingKey.StoreTimezone` is a deployment-wide value with no user,
  branch or location override.
- No delivery or read tracking of any kind: no `EmailLog`,
  `NotificationLog` or `Delivery` model exists, so nothing today can tell
  "sent" from "acted on" for any notification, approval reminders
  included.

## Hardening record

**Kept (3 of 3):**

- **The clock nobody starts** — distinct from lens 04's "Acting cover has
  no clock" (a delegation window between two named people); this times one
  step against nobody, delegate or not. Verified: `MarketingAutomationCron`
  exists at `apps/api/src/modules/marketing/marketing-automation.cron.ts`
  with `@Cron('0 3 * * *')` reading `SettingKey.MarketingAbandonedCartReminderHours`
  and `MarketingAbandonedCartIncentiveHours`; no `.prisma` file anywhere
  defines `model Approval`, `ApprovalStep`, or a `PENDING_APPROVAL` value
  (confirmed by 04g/04h's own grounding and independently re-run here).
- **Store time is not the approver's time** — distinct from the WO-22
  Multi-entity-topology and Scale-tiers lenses (which cover ownership and
  silhouette, never a per-actor clock): this is about which timezone a
  reminder/escalation computation runs against. Verified: `SettingKey.StoreTimezone`
  is defined at `settings.defaults.ts:63` and defaulted at line 149 to
  `BRAND.locale.timeZone`; `Setting` (`core.prisma:153`) is `key/value/
  description/updatedAt` only, no `userId`/branch column; `User`
  (`core.prisma:11`) has no timezone field anywhere in its column list.
- **Acted on, not delivered** — kept only after sharpening its
  differentiation from the WO-22 Notifications lens "Delivery is a fact,
  not a hope," which was not stated in the original draft and is now
  spelled out in the lens's own "Why": that lens builds delivery-tracking
  infrastructure; this one forbids the escalation trigger from depending on
  it at all, because "delivered" still is not "acted on." Verified: no
  `.prisma` file defines `model.*Log`, `model.*Delivery`, or
  `model.*Notification` other than `AuditLog` (`core.prisma:220`).

**Killed:** none in this pass — the third lens was at risk of being a
restatement of "Delivery is a fact, not a hope" and was rewritten rather
than killed, since the surviving distinction (escalation logic must not
couple to notification-layer state, independent of whether delivery
tracking exists) changes what an engineer builds beyond adopting lens 22:
it forbids a specific wrong implementation (`remindedAt`-gated escalation)
that lens 22 alone does not rule out.

**Corrections:**

- The original "Acted on, not delivered" cited the same fire-and-forget
  `NotificationsService` fact as the WO-22 "Delivery is a fact, not a hope"
  lens without saying how the two differ, which is a restatement risk
  under the review's hard constraints. Corrected by rewriting the "Why" to
  name the WO-22 lens explicitly and state the one-clause difference
  (tracking infrastructure vs. an escalation-trigger rule that must not
  depend on it).
- No other citation in the file was found incorrect: `MarketingAutomationCron`'s
  path, its `@Cron` schedule, `SettingKey.MarketingAbandonedCartReminderHours`
  / `MarketingAbandonedCartIncentiveHours` (`settings.defaults.ts:118,120`,
  defaulted at lines 248-249), `SettingKey.StoreTimezone`
  (`settings.defaults.ts:63`, defaulted line 149), `Setting`
  (`core.prisma:153`), `User` (`core.prisma:11`), and the absence of any
  `Approval`/`Delivery`/`Log`/`Notification` model beyond `AuditLog` were
  each verified against the repository as it stands today.
