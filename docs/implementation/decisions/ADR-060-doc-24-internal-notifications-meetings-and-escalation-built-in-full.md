# ADR-060 — Doc 24 (internal notifications, meetings and escalation): built in full, with one new model beyond its own sketch and a countersignature routed to a named person rather than a role

[← Decision log](../DECISIONS.md)


### Context

Doc 24 named a real gap this repository had no answer for: staff messaging
already exists (`NotificationsService`, three real `NotificationChannel`
implementations), but there was no way to say *every department head in
the North region* and have it resolve to people, no way to call a meeting
and know who has not answered, and no way to make a stalled approval
visible when the approver is simply not acting. All three are genuine,
distinct capabilities the document correctly refused to build as three
separate ad-hoc mechanisms.

### Decision — built: `Audience`, `NotifyService`, `MeetingsService`, `EscalationCron`, three permissions, admin UI

`apps/api/src/modules/customers/notify/` now holds `AudienceService` (`resolve()`,
reach-intersected against the sender's own open postings via the same
`reachOf()` pattern `GrantService` already established, and shared
unchanged between preview and the real send), `NotifyService`
(`send()`/`decide()`), `MeetingsService`
(`create()`/`respond()`/`cancel()`/`shortfallReport()`) and
`EscalationCron` (a 10-minute tick climbing `Position.reportsTo`). The
three named permissions (`notify.send`, `notify.broadcast`,
`notify.escalation.manage`) are seeded through `ROLE_PERMISSION_SEED` and
grouped in `PERMISSION_GROUPS`, `notify.broadcast` paired with
`org.access.grant` in `TOXIC_PERMISSION_PAIRS` exactly as the document's
own scope lens named. `notify` is registered as a `core` module — not
off by default — matching `tasks` and `attendance`'s own precedent that a
broadly useful staff-facing capability is not sector- or scale-gated.
Delivery itself is not rebuilt: `NotifyService.dispatch()` and
`MeetingsService`'s own notifications call the existing
`NotificationsService.send()`, so `grep -rn "implements NotificationChannel"`
still returns the same three channels this work order started with.

Two deliberate departures from the document's own literal sketch, both
required to make the document's own stated requirements real rather than
aspirational, not silent improvisation:

1. **`BroadcastMessage` is a new model the document never sketched.**
   `ApprovalService.start(subjectType, subjectId, steps)` requires a real,
   persisted row's id as its subject — there is no way to gate an
   above-quorum announcement behind an approval chain without a row for
   the chain to attach to. The same row also answers the document's own
   "reversal document" scope lens: the permanent record of what was sent,
   to whom, and when, which a fire-and-forget notification send would
   otherwise never produce. `ApprovalSubjectType` gained a
   `BROADCAST_MESSAGE` member for this — the existing generic approval
   engine, never a second one.
2. **The countersignature is routed to a specific person, not a role.**
   `ApprovalService` deliberately does not resolve who may decide a
   step — stated in its own doc comment, and the correct behavior, since
   different callers need different resolution (`RequisitionService` and
   `AccountsService` gate role-shaped approvals by permission; this one
   names a specific individual). Doc 24's own text asks for "someone who
   outranks the sender," which this repository already models as the
   sender's `Position.reportsTo` holder, not a permission category — so
   `NotifyService.managerOf()` resolves that specific person at send
   time, and `NotifyService.decide()` itself checks
   `actorId === step.approverUserId`, throwing `ForbiddenException`
   otherwise. This is a correctness fix caught during implementation, not
   requested separately: without it, anyone holding a role-based
   permission the chain didn't name could decide a step meant for one
   named manager.

Two settings back the quorum threshold the document names but leaves
unmechanised: `NotifyAnnounceQuorumRankLevel` (default 30) and
`NotifyAnnounceQuorumRecipientCount` (default 50), both ordinary
`SettingKey` rows, client-editable with no deploy needed to retune either
number.

`EscalationCron.climb()` resolves the document's own two stated rules
into exact semantics: a vacant post costs no step — the climb passes
through it to its own `reportsTo` for free, and only a position with an
active `Posting` counts against `stepsPerFire`; a fire beyond
`ceilingRankLevel` or past `maxFires` stops rather than escalating
further, and each fire is keyed `@@unique([taskId, fireNumber])` so an
overlapping cron tick is a benign no-op rather than a duplicate page.

### Reasoning

Both departures follow the same rule this document set stays under
throughout this session: a document's own sketch is a specification of
intent, not a contract that forecloses a model the intent cannot actually
work without. `BroadcastMessage` is required, not speculative, by
`CLAUDE.md`'s own "Feature scope" standard — an above-quorum announcement
with no row to hang the approval chain on is not a smaller version of the
feature, it is a broken one. Routing the countersignature to a named
individual rather than a permission category is not a stylistic choice
either: `ApprovalService`'s own doc comment already puts step-ownership
resolution on the caller, and the document's own words ("someone who
outranks the sender") describe a specific relationship this repository
already has a table for (`Position.reportsTo`), so building a new
permission-shaped approval step here would have reintroduced exactly the
gap `notify.broadcast`'s toxic-pair entry with `org.access.grant` was
meant to close from the other direction — anyone with the broad
permission approving their own broadcast.

### Consequences

- Mass internal messaging in this repository can never bypass a human
  countersignature above the configured quorum, and that countersignature
  cannot be satisfied by anyone other than the specific manager the chain
  was addressed to.
- A stalled task now escalates without a human remembering to chase it,
  without ever paging past a configured ceiling or more than
  `maxFires` times, and without losing the post-not-person distinction a
  leaver would otherwise break.
- `docs/implementation/tasks-notifications-support/24-internal-notifications-meetings-escalation.md`
  carries its own Status blockquote naming every real file and both
  departures from its own sketch, following this session's own
  established discipline of naming every deviation rather than letting a
  document imply something was built exactly as first written.
- 27 new spec files under `apps/api/src/modules/customers/notify/` bring the suite
  to 243 suites / 2,538 tests, all passing; `pnpm lint`, `pnpm typecheck`
  and `pnpm build` are all clean, including the `check-hexagonal-purity.mjs`
  and `check-env-templates.mjs` checks ADR-057 and this repository's own
  module-registration discipline both require.

### Status
**Accepted.**
