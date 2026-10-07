# 24 — Internal notifications, meetings and escalation

> **Status: built (2026-09-27), WO-24.1–24.6, DECISIONS.md ADR-060.**
> `notify.prisma` (`Audience`, `BroadcastMessage`, `Meeting`,
> `MeetingInvitation`, `EscalationRule`, `EscalationFire`), `AudienceService`
> (`resolve()`/reach-intersected, shared by preview and the real send),
> `NotifyService` (send/decide, gated above quorum by `ApprovalService`'s
> own generic chain — a new `BROADCAST_MESSAGE` subject type, never a
> second approval engine), `MeetingsService` (create/respond/cancel/
> shortfall), `EscalationCron` (climbs `Position.reportsTo`, skipping a
> vacant post for free, respecting a ceiling and a fire count), the three
> named permissions, and a compose/meetings/escalation-rules admin UI with
> nav entries are all real, at `apps/api/src/modules/customers/notify/` and
> `apps/web/src/app/(admin)/admin/(app)/notify/`. `notify` is a `core`
> module (not off by default), matching `tasks`/`attendance`'s own
> precedent of a broadly-useful capability rather than a sector- or
> scale-gated one.
>
> Two additions beyond the document's own literal sketch, both required to
> make its own stated requirements real rather than aspirational:
> `BroadcastMessage` (not sketched in this document at all) is the record
> an above-quorum send needs to exist as an `ApprovalChain` subject, and is
> also this module's own "reversal document" answer — the permanent proof
> of what was sent, to whom, and when; a countersignature is routed to a
> specific person (the sender's own `Position.reportsTo` holder,
> `NotifyService`'s own `managerOf()`) rather than to a permission
> category, since `ApprovalService` itself does not resolve who may decide
> a step — the caller's own concern, per its own doc comment — and
> `NotifyService.decide()` checks that identity match directly.
>
> Two settings back the quorum this document names but does not fully
> mechanise: `NotifyAnnounceQuorumRankLevel` and
> `NotifyAnnounceQuorumRecipientCount` (`SettingKey`, client-editable, no
> deploy needed to retune either threshold).
>
> **Video rooms for these meetings are
> [`205-self-hosted-video-meetings-livekit.md`](./205-self-hosted-video-meetings-livekit.md)**
> (proposed, not yet built, ADR-074). It extends `Meeting`/`MeetingInvitation`
> and changes nothing above; a meeting with no room stays exactly what this
> document built.

This repository already delivers notifications. `NotificationChannel`
(`apps/api/src/core/notifications/notification-channel.ts`) is the interface,
`EmailChannel`, `ExpoPushChannel` and `LogChannel` implement it,
`NotificationsService` dispatches, and `NOTIFICATION_CHANNELS` decides which are
live. **None of that is rebuilt here.** A second delivery stack for staff
messages — `StaffNotificationService` beside `NotificationsService`, a second
template set, a second retry — is the parallel-systems failure CLAUDE.md names
by prefix: the tell is a name whose job is to say "which half of the app."

What is genuinely missing is not delivery. It is **audience**: the ability to say
*every department head in the North region*, and have that resolve to people.

## The new part: an audience is a query over the org tree

```prisma
/// Who a message goes to, stored as a specification rather than a list of
/// user ids. Stored as a spec because "the finance department" must mean the
/// finance department ON THE DAY IT SENDS, not the membership frozen when
/// somebody drafted the message.
model Audience {
  id          String  @id @default(cuid())
  /// Root of the subtree this addresses. NULL means the whole organization.
  orgUnitId   String?
  /// Include units below the root, or only the root itself.
  includeDescendants Boolean @default(true)
  /// Only people at or above this rank level (doc 20). NULL means everyone.
  minRankLevel Int?
  /// Only these positions, when the audience is a named handful.
  positionIds  String[]

  @@index([orgUnitId])
}
```

Resolution is one function, `AudienceService.resolve(audience, at)`, returning
employees with an open posting matching the spec at that instant. It is pure over
loaded rows so a "who will receive this" preview and the actual send share one
implementation — the same discipline doc 21 applies to `previewIssue()`.

**The sender's reach bounds the audience.** A regional manager cannot address the
whole organization: `resolve()` intersects the requested audience with the
sender's own subtree from doc 21, and the preview shows the intersection, not the
request. A silently-narrowed send is worse than a refused one, so the preview
names what was excluded.

## Meetings are a notification that expects an answer

A meeting call is not a new transport. It is a message with three additions: a
time, a place, and a required response.

```prisma
model Meeting {
  id         String   @id @default(cuid())
  title      String
  detail     String?
  startsAt   DateTime
  endsAt     DateTime
  timezone   String   /// Same rule as attendance: a group spans zones.
  location   String?
  audienceId String
  calledByUserId String
  orgUnitId  String
  createdAt  DateTime @default(now())

  invitations MeetingInvitation[]
}

model MeetingInvitation {
  id         String  @id @default(cuid())
  meetingId  String
  employeeId String
  /// Required means the meeting reports a shortfall when this person does not
  /// answer; optional means it does not.
  required   Boolean @default(true)
  response   InviteResponse @default(NO_RESPONSE)
  respondedAt DateTime?

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  @@unique([meetingId, employeeId])
  @@index([employeeId, response])
}

enum InviteResponse { NO_RESPONSE ACCEPTED DECLINED TENTATIVE }
```

Invitations are materialised at send time — resolved once, then fixed — because a
person invited on Monday must still be able to answer on Tuesday after being
moved to another department. The audience is a live spec; the invitation list it
produced is a record.

## Escalation: the timer that makes a stalled approval visible

The catalogue names a failure this repository has no answer for: *an approval
that stalls because a healthy approver simply is not acting.* Doc 20 gives the
chain (`Position.reportsTo`), doc 23 gives the work; this is the timer.

```prisma
model EscalationRule {
  id             String @id @default(cuid())
  organizationId String
  /// What it watches, by the same (type, id) convention doc 23 uses, so this
  /// module imports no module it escalates for.
  sourceType     String
  /// How long without a state change before it fires.
  afterMinutes   Int
  /// How many rungs up `Position.reportsTo` to climb per step.
  stepsPerFire   Int @default(1)
  /// Stop climbing here. NULL climbs to the root, which is almost never
  /// wanted — a policy that pages the chief executive about a stock count.
  ceilingRankLevel Int?
  maxFires       Int @default(3)

  @@unique([organizationId, sourceType])
}
```

Two rules, learned from how escalation usually goes wrong:

1. **It climbs posts, not people.** A vacant post is skipped to its own
   `reportsTo` — which is precisely the leaver case, handled by construction.
2. **It has a ceiling and a fire count.** An escalation with neither becomes a
   nightly email to an executive who filters it, at which point the mechanism is
   worse than nothing because it looks like it is working.

## Scope lenses

**The actor with three tables** — n/a: addresses `Employee` via posting.
**The principal with no permission key** — escalation fires with no user;
messages it sends carry a system sender and are labelled as such in the UI, so no
one believes a human chased them.
**The grant that ends itself** — n/a: a notification confers no access.
**Whose rows, and which columns** — a sender sees only recipients inside their
own subtree; the meeting list shows units the caller reaches. Decline *reasons*
are visible only to the caller and the invitee.
**The threshold nobody approves alone** — an announcement addressed above
`ANNOUNCE_QUORUM_RANK` (policy) or to more than N people requires a
countersignature from someone who outranks the sender. Mass internal messaging is
the control that is always missing until the first all-staff accident.
**The toxic pair** — `notify.broadcast` with `org.access.grant`: address everyone
and widen your own reach. Refused together.
**Authority and blast radius** — who may write an `EscalationRule`, at which
organization; the worst value is `ceilingRankLevel` NULL with `afterMinutes` 1,
which pages the whole chain every minute. The audit row carries old and new rule.
**Request or record** — REQUEST for sending; **RECORD** for a received response —
an invitee who answered answered, and a late answer is still recorded, flagged
late rather than refused.
**The movement with no address** — n/a: writes no stock or cash.
**Four hours down, the counter stays open** — sends queue in the existing outbox
and deliver on reconnect; a meeting whose start passed while offline is delivered
with its lateness visible rather than silently dropped. Escalation timers run on
the node that owns the work, so a disconnected branch still escalates internally.
**The unwritten posting rule** — n/a: writes no journal line.
**Every column or none** — n/a: writes no `JournalLine`.
**The period that already moved** — n/a.
**The second legal entity** — audiences are scoped by unit, which carries the
brand; a second brand needs no change.
**Dry run before live** — `AudienceService.preview()` returns the resolved
recipients, the count, and what the sender's reach excluded. Holds no `prisma.`
write and no `publish(`; it is what the send screen calls.
**Three silhouettes** — Solo: no audiences, no escalation, notifications stay
customer-facing exactly as today. Chain: department announcements, shift
meetings. Organization: regional broadcast, multi-step escalation with ceilings.
**The absent collaborator** — with tasks off, escalation has nothing to watch and
must boot anyway; with `expo_push` disabled, delivery degrades to the remaining
channels and the send still records.
**The second copy of the write** — `@@unique([meetingId, employeeId])` stops a
duplicate invitation; a redelivered escalation event is made a no-op by the fire
count, which is stored per source row and not per delivery.
**The hundred-thousandth row** — an all-staff message at 100k employees is 100k
invitation rows and 100k deliveries; resolution is paginated and the send is
chunked through the outbox, never one transaction. The preview states the count
before the sender commits, because that number is the thing they should see.
**The reversal document** — a meeting is CANCELLED with a notice to the same
materialised invitation list, never deleted; a sent message cannot be unsent and
the UI must not imply otherwise.
**The undo fan-out** — cancelling notifies invitees (automatic), does not recall
delivered email (deliberately irreversible), and leaves escalation fires recorded
(needs a human to reset, named screen).
**The version stamp** — an escalation fire records the rule version it applied,
so last quarter's escalation can be explained after the policy changes.
**The erasure the ledger cannot obey** — `MeetingInvitation` holds an employee
reference and a response; it is pseudonymised with the employee (doc 20).
Message bodies sent by email already live in `InboundEmail`/outbox payloads,
which doc 25's retention basis covers.
**The failure path** — a failed delivery lands in the outbox FAILED state after
`MAX_ATTEMPTS`, is listed on the operations screen, and is replayed there;
replay is safe because delivery is keyed per invitation.

## Work orders

**WO-24.1 — `Audience` and `AudienceService.resolve/preview`**, intersected with
sender reach.
**WO-24.2 — internal message send** through the existing `NotificationsService`.
No new channel class, no second template registry.
**WO-24.3 — `Meeting` and `MeetingInvitation`**, materialised at send, RSVP,
shortfall report on required invitees.
**WO-24.4 — `EscalationRule` and the runner**, climbing posts with a ceiling and
a fire count, keyed idempotently per source row.
**WO-24.5 — permissions**: `notify.send` (low, own subtree), `notify.broadcast`
(high, countersigned), `notify.escalation.manage` (high).
**WO-24.6 — UI**: compose with a live recipient preview and the exclusion notice,
meeting screen with responses, escalation rules under settings.

## Acceptance

- `preview()` and the real send resolve the identical recipient set, proven by a
  spec calling both.
- A sender cannot reach outside their subtree; the attempt is narrowed and the
  exclusion is shown, not silent.
- Escalation skips a vacant post and climbs to its `reportsTo`, stops at the
  ceiling, and never exceeds `maxFires`.
- Disabling `expo_push` degrades delivery without failing the send or losing the
  record.
- No new class implements delivery: `grep -rn "implements NotificationChannel"`
  returns the same three channels as before this work order.

## Out of scope

Customer-facing notifications (unchanged), chat and threaded discussion — named
and deliberately not built, calendar integration (ICS export is the seam, and
only the seam is declared here), performance scoring from response rates (doc 26).
