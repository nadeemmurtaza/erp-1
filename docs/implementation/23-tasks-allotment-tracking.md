# 23 — Task allotment, status and tracking

A task system is easy to build and easy to build wrongly. The wrong version
assigns work to a person, stores a status as a string, and discovers on the day
somebody resigns that four hundred tasks are addressed to a user who no longer
exists — invisible, unreassignable, and blocking whatever waits on them.

Three decisions prevent that, and they are the whole design.

## 1. Work is assigned to a post, and optionally to a person

`Task.positionId` is required; `Task.assigneeEmployeeId` is nullable. The post is
the durable address (doc 20); the person is who currently holds it. When a
posting ends, the tasks do not become orphans — they become **unclaimed at a
post that still exists**, visible to whoever holds it next and to that post's
`reportsTo`.

This is the direct answer to the failure named in the lens catalogue as *the
approval that stalls without a leaver*: the chain is a property of the org
chart, so it survives the person.

## 2. Status is a small enum plus a per-client workflow, not a string

```prisma
enum TaskState { OPEN IN_PROGRESS BLOCKED DONE CANCELLED }
```

Five states, fixed, because every consumer — dashboards, escalation, reporting —
must reason about them without knowing the client. What *is* client-specific is
the **stage** inside `IN_PROGRESS`: "cutting", "stitching", "QA". Stages are rows
(`TaskStageDefinition`), ordered, per organization, exactly as `OrgUnitType` and
`Rank` are rows. A client adds a stage without a migration; nothing that reasons
about completion has to learn it.

## 3. A transition is an event, not an overwrite

`Task.state` is the current value, and `TaskTransition` is the history. "How long
did this sit in BLOCKED" is the question every operations lead asks, and it is
unanswerable from a mutated column.

## Schema — `tasks.prisma`

```prisma
model Task {
  id         String @id @default(cuid())
  /// Human reference, per organization. Gapless is NOT required here — a task
  /// number is not a legal document. Doc 25 is where gapless matters.
  reference  String
  title      String
  detail     String?

  /// The durable address. Required.
  positionId String
  /// The current holder, when there is one. NULL means unclaimed at that post.
  assigneeEmployeeId String?
  /// Where the work belongs, copied at write time so a re-parent (doc 19)
  /// does not move history.
  orgUnitId  String

  state      TaskState @default(OPEN)
  stageId    String?
  priority   Int       @default(0)
  dueAt      DateTime?

  /// What this task is about, when it came from somewhere else — an order, a
  /// stock count, a work order. Polymorphic by (type, id) rather than a
  /// foreign key per module, because a module must stay droppable (CLAUDE.md,
  /// module independence): tasks may not import the modules it serves.
  sourceType String?
  sourceId   String?
  /// Idempotency for machine-created tasks: a redelivered domain event must
  /// not raise a second task.
  sourceRef  String?

  createdByUserId String?
  createdAt  DateTime @default(now())
  closedAt   DateTime?

  position    Position          @relation(fields: [positionId], references: [id])
  transitions TaskTransition[]

  @@unique([sourceType, sourceRef])
  @@index([positionId, state])
  @@index([assigneeEmployeeId, state])
  @@index([orgUnitId, state])
  @@index([dueAt])
}

model TaskTransition {
  id        String    @id @default(cuid())
  taskId    String
  fromState TaskState?
  toState   TaskState
  fromStageId String?
  toStageId   String?
  /// Who moved it. NULL when the mover was the system (an escalation, a cron).
  byUserId  String?
  reason    String?
  occurredAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId, occurredAt])
}

model TaskStageDefinition {
  id             String @id @default(cuid())
  key            String
  label          String
  order          Int
  organizationId String

  @@unique([organizationId, key])
}
```

`@@unique([sourceType, sourceRef])` is the idempotency the outbox needs: a
redelivered `orders.order_placed` raises one task, not one per delivery. It
carries the same NULL exemption as every composite unique here — both columns are
null for hand-created tasks, which is correct, because those are not idempotent
and should not be.

## Reassignment when someone leaves

Doc 20 ends a posting; this module reacts to it. **It does not silently
reassign.** On `hr.posting_ended`, every open task at that post is left at the
post, marked unclaimed, and surfaced on a named screen to the post's
`reportsTo`. A human decides. Automatic reassignment is exactly how work
disappears into the inbox of whoever the algorithm liked.

## Scope lenses

**The actor with three tables** — n/a: assigns to `Position`/`Employee`, both
from doc 20.
**The principal with no permission key** — the system itself creates tasks from
domain events with no user; those rows carry `createdByUserId` NULL and
`byUserId` NULL on the transition, which is how a reader tells machine from human.
**The grant that ends itself** — n/a: a task confers no access. Seeing a task is
doc 21's subtree scope.
**Whose rows, and which columns** — a task list is filtered to the caller's
subtree; `detail` may carry customer information and is excluded from the
cross-unit reporting view.
**The threshold nobody approves alone** — n/a: a task commits no money or stock.
A task that *triggers* something that does is the trigger's problem, not this
module's — stated so nobody adds an approval here and believes it guards a ledger.
**The toxic pair** — `tasks.assign` with `tasks.close`: assigning yourself work
and marking it done unobserved is only a control weakness where the task gates
something; refused together only for tasks whose `sourceType` is a money module,
which is the one place it matters.
**Authority and blast radius** — who may add or reorder a stage, at which
organization; reordering stages does not rewrite history because transitions
store the stage id they moved to.
**Request or record** — REQUEST. A transition may be refused (illegal move,
closed task).
**The movement with no address** — `orgUnitId` required and copied; no default.
**Four hours down** — a branch keeps creating and transitioning tasks locally;
tasks are branch-authoritative facts and replicate up, never down (R2 direction,
declared here per the lens the catalogue raised about replication class).
**The unwritten posting rule** — n/a: writes no journal line.
**Every column or none** — n/a: writes no `JournalLine`.
**The period that already moved** — n/a: no dated financial fact.
**The second legal entity** — `reference` is scoped per organization.
**Dry run before live** — `TaskService.canTransition(task, to)` is pure and is
what the UI calls to disable the button, so the rule has one implementation.
**Three silhouettes** — Solo: a checklist on one screen, one implicit post.
Chain: per-branch queues. Organization: cross-unit reporting and escalation.
**The absent collaborator** — every module that raises tasks is optional; tasks
imports none of them, which is why `sourceType` is a string and not a relation.
With notifications (doc 24) off, tasks still work and simply tell nobody.
**The second copy of the write** — `@@unique([sourceType, sourceRef])`.
**The hundred-thousandth row** — millions over years; every list query is bounded
by one of the four indexes, closed tasks are archived by `closedAt` after the
policy window, and the default screen never issues an unbounded scan.
**The reversal document** — CANCELLED with a reason, never a delete; the
transition history says who cancelled and why.
**The undo fan-out** — reopening a DONE task is a new transition (automatic);
anything the task already caused downstream is not reversed by reopening it
(deliberately irreversible) and the screen says so.
**The version stamp** — a transition stores the stage id it moved to, so a
renamed or reordered stage does not re-shape last quarter's cycle-time report.
**The erasure the ledger cannot obey** — `byUserId` on historical transitions
survives erasure of the user; transitions are pseudonymised, not deleted, because
"who moved this" is the audit.
**The failure path** — a machine-created task whose event handler failed lands in
the existing outbox FAILED state with its payload; the reconcile screen from doc
22's pattern lists it, and `sourceRef` makes replay safe.

## Work orders

**WO-23.1 — schema**, four indexes, stage definitions seeded empty.
**WO-23.2 — `TaskService`**, sole writer; `canTransition` pure; every transition
writes a `TaskTransition`.
**WO-23.3 — event intake**: a generic subscriber that turns a declared domain
event into a task via a registry entry, so no module imports tasks and tasks
imports no module.
**WO-23.4 — leaver handling**: on `hr.posting_ended`, unclaim and surface. No
automatic reassignment.
**WO-23.5 — permissions**: `tasks.view` (low), `tasks.assign` (medium),
`tasks.close` (medium), `tasks.admin` (high) for stage definitions.
**WO-23.6 — UI**: my-work list, post queue, one task drawer with the transition
history visible. Nav entry.

## Acceptance

- Ending a posting leaves its open tasks visible at the post and on the manager's
  screen; none are auto-assigned and none disappear.
- A redelivered source event creates no second task.
- Cycle time in each state is computable from `TaskTransition` alone, proven by a
  spec that reconstructs it without reading `Task.state`.
- A module raising tasks can be removed from `MODULES` and the task module still
  boots — proven by the pack-absence test.
- An illegal transition is refused by the same function the UI uses to disable
  the button.

## Out of scope

Notifications about tasks (doc 24 — this module raises the event, that one
decides who hears it), performance scoring from task throughput (doc 26),
dependencies between tasks and Gantt-style scheduling: named, deferred, not
stubbed.
