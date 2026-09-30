# ADR-050 — Doc 23 (task allotment, status and tracking): built exactly as specified, with `Employee` translated to `User` per ADR-044, a new `hr.posting_ended` domain event added since doc 20's build didn't need one, and the toxic pair kept out of `TOXIC_PERMISSION_PAIRS`

[← Decision log](../DECISIONS.md)


### Context

Doc 23 (`tasks-notifications-support/23-tasks-allotment-tracking.md`)
names `Task.assigneeEmployeeId` and reacts to an `hr.posting_ended` domain
event. Neither exists as the doc's own literal text assumes: ADR-044
(this document, ~150 lines above) already resolved docs 19/20 with no
`Employee` model at all — `Position`/`Posting` key straight to `User.id`,
with `EmployeeProfile` (1:1 `User`) holding the HR-specific fields.
Checked directly against `apps/api/src/modules/hr/people.service.ts`:
`PostingService.end()` exists and works, but publishes no domain event —
doc 20's own acceptance criteria never needed one, so nobody added it.

### Decision

**`Task.assigneeUserId`, not `assigneeEmployeeId`.** Every later
`hr-people-org`/`tasks-notifications-support` document naming "Employee"
means "a `User` holding a `Posting`" per ADR-044's own stated
consequence — this is the first document to actually hit that
translation in its own schema, not just its prose.

**`PostingService.end()` now publishes `DomainEvent.PostingEnded` (`'hr.posting_ended'`)**,
added to the catalogue in `domain-events.ts` alongside its payload
(`{ postingId, userId, positionId, endedOn }`) — the exact shape WO-23.4
needs to unclaim a post's open tasks and surface them to `reportsTo`.
This is doc 20's own missing half, not doc 23's to route around: doc 20's
"Consequences" already promises "the `path`/reporting chain survives the
person," and a leaver's tasks going nowhere would silently break that
promise the day this module exists to notice. Adding the publish call to
an already-shipped method, with no signature change and no behavior
change for any existing caller, is the smallest complete fix — checked
against every current call site of `PostingService.end()` before writing
it, to confirm none of them run inside a code path that would double-fire
on retry.

**The `tasks.assign`/`tasks.close` toxic pair is NOT added to
`TOXIC_PERMISSION_PAIRS`.** That mechanism (`RolesService.create()`/
`.update()`, ADR-045/ADR-046's own precedent) refuses a ROLE from ever
holding both keys — appropriate for `org.structure.manage`+
`org.access.grant`, where the two together are dangerous in every case.
Doc 23's own text scopes the danger narrower: "assigning yourself work
and marking it done unobserved is only a control weakness where the task
gates something... refused together only for tasks whose `sourceType` is
a money module." Most `STAFF` legitimately holds both keys and self-closes
ordinary tasks constantly; a role-level refusal would make the common
case unusable to prevent a risk that only exists for one `sourceType`.
Enforced instead as a per-instance check inside `TaskService.close()`:
when `task.sourceType` names a money-adjacent module (the same list
`AiFeature`'s own budget-gated set or `KNOWN_MODULE_COUPLINGS`'
finance-adjacent entries already name — see the actual enforcement code
for the exact list), refuse a close whose actor matches the task's own
`assigneeUserId` set at *assignment* time, mirroring `closeShift()`'s
existing `closedByUserId`-vs-`openedByUserId` pattern CLAUDE.md itself
cites as the house style for this class of check, rather than force-fit a
role-level mechanism built for a different shape of risk.

**`TaskStageDefinition.organizationId` dropped, `key` unique alone** —
the identical, now three-times-repeated correction ADR-040/ADR-044 already
make for the same reason: this deployment is the tenant boundary, and
`organization` is off by default everywhere today.

### Consequences

- `hr.posting_ended` is now a real, subscribable event; any future
  document reacting to someone leaving a post (performance scoring cutoff,
  a leaver's pending-approvals sweep) subscribes to this one, never adds a
  second "posting ended" signal.
- `tasks` imports no other module (WO-23.3's own generic event-intake
  registry is how e.g. `orders.order_placed` becomes a task) and no other
  module imports `tasks` — a money-adjacent module marking its own
  `sourceType` string is the entire coupling surface, matching the doc's
  own "absent collaborator" lens.
- A future real toxic-pair need with the SAME "only in this specific
  context" shape should read this ADR before reaching for
  `TOXIC_PERMISSION_PAIRS`, which is for role-level, context-free pairs
  only.

### Status
**Accepted.**
