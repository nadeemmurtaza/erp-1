# 61 — A bulletin board, not another notification channel

> **Status: built (2026-09-27), WO-61.1–61.5, DECISIONS.md ADR-062.**
> `Bulletin`/`BulletinAcknowledgement`/`BulletinCategory`
> (`notify.prisma`), `BulletinsService`
> (`publish()`/`list()`/`get()`/`acknowledge()`/`retract()`),
> `BulletinNotificationListener` (the only subscriber to the new
> `DomainEvent.BulletinPublished`), the two named permissions, and a
> two-screen admin UI (`/admin/bulletins`, `/admin/bulletins/new`) with a
> nav entry are all real, at `apps/api/src/modules/customers/notify/` and
> `apps/web/src/app/(admin)/admin/(app)/bulletins/`.
>
> Lives inside the `notify` module, not `hr` (this document's own casual
> suggestion, "wherever `NotificationsService` is already wired") —
> `hr` and `notify` are separate module packs with no approved coupling,
> and this document's own rule ("never a bulletin-specific second
> audience-resolution mechanism") leaves no other place to reuse
> `AudienceService.resolve()` directly. `AudienceService.reachOf()` was
> widened from `private` to a plain method on the same class for this,
> not duplicated.
>
> Two decisions beyond this document's own literal sketch, both required
> to make its own "Authority and blast radius" scope lens real rather than
> aspirational — see `DECISIONS.md` ADR-062 for the full reasoning:
> `BulletinsService.publish()` refuses (`ForbiddenException`) a
> reach-bound author addressing a unit they do not hold a posting at
> directly, or the whole organization by name (`audienceOrgUnitId: null`)
> — this document's own sketch code shows no such check, though its own
> prose names the boundary. Reading the board uses a distinct computation
> from a sender's reach: `eligibleAudienceIds()` flattens every
> `OrgUnit.path` a reader's own postings resolve to, so a notice addressed
> to a unit reaches every reader posted anywhere in its subtree — the
> SUBTREE-INVERSE of `reachOf()`'s own exact-unit-match answer, not the
> same question asked twice.
>
> `Employee` is `User` and `authorId`/`BulletinAcknowledgement.userId`
> carry no `organizationId` — the same two deviations from this document's
> own literal sketch every other doc-24-family build in this codebase
> already makes (ADR-044/040/046/049/060).

Doc 24's own stated scope (`docs/implementation/tasks-notifications-support/24-internal-notifications-meetings-escalation.md`,
lines 1-20) is explicit: delivery infrastructure (`NotificationChannel`,
`EmailChannel`, `ExpoPushChannel`, `LogChannel`, `NotificationsService`,
`NOTIFICATION_CHANNELS`) already exists, and doc 24's own "new part" is
audience-as-a-query-over-the-org-tree — a push, not a place. Nothing in
this repository is a **persistent, browsable record** of company memos,
HR policies, and notices that an employee can open days later and still
read. That absence is this document's entire scope: a bulletin **board**
(the record), reusing doc 24's own delivery for the "you have a new
notice" ping, never a second delivery mechanism.

## 1. A `Bulletin` is a record; `NotificationsService` announces it, never replaces it

```prisma
model Bulletin {
  id             String    @id @default(cuid())
  organizationId String
  authorId       String    // User.id — who posted it
  title          String
  bodyMarkdown   String
  category       BulletinCategory  // POLICY | MEMO | NOTICE | HR_ANNOUNCEMENT
  audienceOrgUnitId String?  // null = whole organization; a subtree otherwise
  publishedAt    DateTime  @default(now())
  expiresAt      DateTime?  // optional — some notices are time-bound
  requiresAcknowledgement Boolean @default(false)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  acknowledgements BulletinAcknowledgement[]

  @@index([organizationId, audienceOrgUnitId, publishedAt])
}

model BulletinAcknowledgement {
  id          String   @id @default(cuid())
  bulletinId  String
  employeeId  String
  acknowledgedAt DateTime @default(now())

  bulletin Bulletin @relation(fields: [bulletinId], references: [id])

  @@unique([bulletinId, employeeId])
}

enum BulletinCategory {
  POLICY
  MEMO
  NOTICE
  HR_ANNOUNCEMENT
}
```

`BulletinCategory` is a fixed enum, not a rows-over-enums violation — these
four are structural kinds this module's own UI groups by (a policy renders
differently from a notice), not a client-varying taxonomy like `LeaveType`;
the same reasoning doc 43's own `AttendanceEventType` enum already rests on.

`requiresAcknowledgement` + `BulletinAcknowledgement` exists because a real
HR policy notice ("read and acknowledge the new leave policy") is a
common, named requirement — not speculative, since it is the exact reason
a bulletin board differs from a notification: a notification cannot be
proven read after the fact, a bulletin's acknowledgement row can.

## 2. Publishing a bulletin fires doc 24's own notification, once

```ts
async publish(input: CreateBulletinInput): Promise<Bulletin> {
  const bulletin = await this.prisma.bulletin.create({ data: input });
  await this.eventBus.publish('bulletin.published', {
    bulletinId: bulletin.id,
    audienceOrgUnitId: bulletin.audienceOrgUnitId,
  });
  return bulletin;
}
```

A listener in `hr` (or wherever `NotificationsService` is already wired)
resolves the audience the identical way doc 24's own audience-as-a-query
does, and sends one push/email per recipient pointing at the bulletin —
never a bulletin-specific second audience-resolution mechanism.

## Scope lenses

**The actor with three tables** — `Bulletin.authorId`/`BulletinAcknowledgement.employeeId`
both `User`/`Employee`, doc 20's own existing actors; no new actor kind.
**The principal with no permission key** — n/a: every reader/writer is an
authenticated `User`.
**The grant that ends itself** — n/a: no standing grant; `hr.bulletins.publish`
is checked per-write, per doc 20's existing role model.
**Whose rows, and which columns** — a bulletin's `audienceOrgUnitId` scopes
who can *see* it exactly as doc 24's own audience query; publishing is
gated by `hr.bulletins.publish`, reading by ordinary authenticated access
scoped to the caller's own subtree membership.
**The threshold nobody approves alone** — n/a: publishing a memo commits no
money or stock; no approval quorum applies. A future "requires sign-off
before publishing" workflow is doc 63's generic approval-chain mechanism
applied here, not a bespoke one.
**The toxic pair** — n/a: no permission pair is toxic together here.
**Authority and blast radius** — who may publish org-wide vs. subtree-only
is `audienceOrgUnitId` plus `hr.bulletins.publish`, scoped identically to
every other org-tree-scoped write in this repository; the audit row is
`AuditService`'s own existing create-event record, old/new value being the
bulletin's own fields.
**Audience is a capability, not an address** — restated as this document's
own central design: `audienceOrgUnitId` resolves recipients through the
org tree exactly as doc 24 already requires, never a literal address list.
**Request or record** — publishing is a REQUEST (the publish call can fail
validation, e.g., empty title); once published, the `Bulletin` row itself
is a RECORD of what was said and when, immutable in its published form
(an edit creates a new `updatedAt`, never silently rewrites history readers
may have already acknowledged against — see "The version stamp" below).
**The movement with no address / The unwritten posting rule / Every column
or none / The period that already moved / The second legal entity** —
n/a: no money or stock fact.
**Dry run before live** — n/a: publishing has no computed rule to preview.
**Three silhouettes** — Solo: a handful of memos a year, mostly HR notices.
Chain: real cross-branch policy distribution, `audienceOrgUnitId` doing
real work. Organization: cross-brand HR communications, where
acknowledgement-tracking (compliance evidence) matters most.
**The absent collaborator** — with `hr` off, the bulletin board does not
render (`MOD-1`); with delivery channels off (doc 24's own degrade path),
the bulletin still exists and is readable, only the "new notice" ping is
silent — the record survives even if the push does not.
**The second copy of the write** — `publish()` is a single `create`, no
retry path duplicates a bulletin; `BulletinAcknowledgement`'s
`@@unique([bulletinId, employeeId])` makes a second acknowledgement click
a no-op, never a duplicate row.
**The hundred-thousandth row** — `Bulletin` is indexed by
`(organizationId, audienceOrgUnitId, publishedAt)` for the "current
notices for my subtree" list query; `BulletinAcknowledgement` grows one
row per employee per acknowledged bulletin, bounded by headcount ×
bulletin count, never unbounded per-view logging (a view is not tracked,
only an explicit acknowledgement).
**The reversal document** — a bulletin is retracted, not deleted: an
`archivedAt` field (added when the need is real) removes it from the
active list while the row and its acknowledgements remain, the same
"a record is never erased, only superseded" discipline this repository
applies to `JournalEntry` reversal.
**The undo fan-out** — retracting a bulletin does not un-send the
notification already delivered (email/push cannot be recalled); the
record's own retraction timestamp is the visible correction.
**The version stamp** — editing a published bulletin's body updates
`updatedAt` but never invalidates an existing `BulletinAcknowledgement` —
an employee acknowledged the version they read; a substantive policy
change severe enough to require re-acknowledgement is republished as a
new `Bulletin`, not an in-place edit, so its acknowledgement trail stays
honest.
**The erasure the ledger cannot obey** — `Bulletin.authorId` and
`BulletinAcknowledgement.employeeId` both hold a person; on user deletion,
`authorId`/`employeeId` follow doc 20's own stated basis (pseudonymise or
retain per audit-record precedent), never silently cascaded away — a
policy notice's authorship is itself a compliance fact.
**The failure path** — a failed publish leaves no partial `Bulletin` row
(a single transactional create); a failed notification fan-out is doc 24's
own existing failure path (the outbox/retry story), not duplicated here.

## Work orders

**WO-61.1 — schema**: `Bulletin`, `BulletinAcknowledgement`,
`BulletinCategory`, forward-only migration.
**WO-61.2 — `BulletinsService`**: `publish()`, `list(audienceScope)`,
`acknowledge(bulletinId, employeeId)`, `retract(bulletinId)`.
**WO-61.3 — event**: `bulletin.published` consumed by a listener that
resolves the audience via doc 24's own org-tree query and sends through
`NotificationsService` — no new channel.
**WO-61.4 — permissions**: `hr.bulletins.publish`, `hr.bulletins.view`
(view likely granted broadly, since a bulletin board's whole point is
being read by everyone in scope), seeded to real roles.
**WO-61.5 — UI**: a bulletin-board screen (list + detail), a "post notice"
form gated by `hr.bulletins.publish`, an acknowledgement checkbox on
notices with `requiresAcknowledgement`, a nav entry.

## Acceptance

- A published bulletin is visible only to users within its
  `audienceOrgUnitId` subtree (or the whole org, if null).
- Publishing fires exactly one `bulletin.published` event; the fan-out
  reuses `NotificationsService`, never a second delivery path.
- A double-click of "acknowledge" produces exactly one
  `BulletinAcknowledgement` row, proven by the unique constraint.
- Retracting a bulletin removes it from the active list without deleting
  its row or its acknowledgement trail.
- With `hr` off, no bulletin-board nav entry or route is reachable.

## Out of scope

Threaded comments/replies on a bulletin — this is a broadcast board, not a
discussion forum; a real request for two-way discussion is a distinct,
larger scoping pass. Rich media attachments beyond markdown — named as a
natural extension of doc 09's own file-storage abstraction (`StorageDriver`)
when a real requirement for it exists, not built speculatively here.
