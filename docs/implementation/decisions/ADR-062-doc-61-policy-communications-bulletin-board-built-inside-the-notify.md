# ADR-062 — Doc 61 (policy communications bulletin board): built inside the `notify` module rather than `hr`, an author-side reach check the document's own sketch omits, and a read-side visibility rule distinct from a sender's reach

[← Decision log](../DECISIONS.md)


### Context

Doc 24 already gave this repository a way to push an internal message to a
resolved audience. It gave no way to keep one: a company policy notice or
HR memo an employee can open days later and still read. Doc 61 names that
gap precisely and refuses to rebuild delivery for it — the entire scope is
a persistent, browsable record (`Bulletin`), reusing doc 24's own
`NotificationsService` fan-out for the "you have a new notice" ping.

### Decision — built: `Bulletin`/`BulletinAcknowledgement`, `BulletinsService`, a listener, two permissions, a two-screen admin UI

`Bulletin` (title, `bodyMarkdown`, `category`, `audienceOrgUnitId`,
`expiresAt`, `requiresAcknowledgement`, `archivedAt`) and
`BulletinAcknowledgement` (`@@unique([bulletinId, userId])`) land in
`notify.prisma`, not `hr.prisma` — the document's own casual suggestion
("wherever `NotificationsService` is already wired"). `hr` and `notify`
are separate module packs with no entry in `KNOWN_MODULE_COUPLINGS`, and
the document's own central rule — "never a bulletin-specific second
audience-resolution mechanism" — leaves no way to reuse
`AudienceService.resolve()` from a different module without one. Placing
`BulletinsService`/`BulletinsController`/`BulletinNotificationListener`
inside `notify` alongside the service that already owns audience
resolution is the only placement that keeps that rule true; `AudienceService
.reachOf()` was widened from `private` to a plain method on the same class
for this, not duplicated.

Two permissions, seeded exactly as the document asks: `hr.bulletins.view`
(low, seeded broadly to TAILOR/STAFF/ADMIN — "the whole point is being
read by everyone in scope," the document's own words, and the one `hr.*`
key in this codebase that is NOT ADMIN-only) and `hr.bulletins.publish`
(medium, scoped to the publisher's own reach). The admin UI is two
screens, not one — `/admin/bulletins` (the board, gated by the broad
permission) and `/admin/bulletins/new` (the post form, gated by the
narrow one) — Law 5 ("one main job per page"), since a page combining a
publish form with a general-readership board would show the form to
everyone whether or not they may use it.

Two things the document's own sketch does not specify, both decided
during implementation rather than left to guesswork:

1. **An author-side reach check `publish()` performs before writing
   anything.** The document's own scope lens states this is a real
   authority boundary ("who may publish org-wide vs. subtree-only… scoped
   identically to every other org-tree-scoped write") but its own code
   sketch shows no such check. Doc 24's own `AudienceService.resolve()`
   narrows a REQUESTED recipient list to a sender's reach at send time —
   there is no equivalent narrowing available for a persistent record,
   since nothing re-checks a `Bulletin` row's own `audienceOrgUnitId`
   after it is written. Left unchecked, a low-level employee could publish
   with `audienceOrgUnitId: null` and have it render as a genuinely
   org-wide notice. `BulletinsService.publish()` therefore calls the same
   `AudienceService.reachOf()` doc 24 already uses and refuses (Forbidden)
   an `audienceOrgUnitId` the author does not hold a posting at directly,
   or a `null` (org-wide) request from a reach-bound author. An
   unrestricted author (no posting at all — a fresh deployment's ADMIN)
   may address the whole organization, the identical unrestricted-reach
   reasoning `reachOf()` already documents.
2. **A read-side visibility rule that is the SUBTREE-INVERSE of a
   sender's reach, not the same computation.** `AudienceService.reachOf()`
   answers "which exact units does this sender hold a posting in" (used to
   narrow a REQUESTED audience). Reading a bulletin board asks a different
   question: "does a notice addressed to unit X reach a reader posted at a
   DESCENDANT of X?" `BulletinsService.eligibleAudienceIds()` answers it by
   flattening every `OrgUnit.path` the reader's own postings resolve to —
   a distinct computation from `reachOf()`, not a duplicate of it, and
   documented as such in its own doc comment so a future reader does not
   "simplify" the two into one.

### Reasoning

Both decisions follow this session's own repeated finding: a document's
sketch is a specification of intent the code must satisfy, not a contract
that forecloses whatever the intent cannot actually work without. An
authority boundary named in prose ("who may publish org-wide vs.
subtree-only") but absent from the sketch's own code is still a
requirement — the scope lens is normative, the code block underneath it
is illustrative. Building the write path with no such check would have
shipped exactly the "audience is a capability, not an address" violation
CLAUDE.md's own lens catalogue exists to catch, just one document later
than usual. The read-side computation earns its own name rather than
reusing `reachOf()`'s, because conflating "the sender's own posting units"
with "every unit whose subtree includes the reader" would have been wrong
in both directions: a sender addressing their own literal unit would
exclude every descendant reader, and a reader far up the tree from a
narrowly-addressed notice would incorrectly see it.

### Consequences

- A bulletin addressed to a unit is readable by everyone posted anywhere
  in that unit's own subtree, and by nobody else, without a second
  audience-resolution mechanism ever being written.
- A publisher bound to a reach cannot widen a notice's audience beyond
  their own posting by choosing a wider `audienceOrgUnitId` or `null` —
  the identical authority boundary doc 24 already enforces for a
  broadcast, now enforced here too, before the row is ever written rather
  than discovered later by an accidentally-org-wide notice.
- `docs/implementation/tasks-notifications-support/61-policy-communications-bulletin.md`
  carries its own Status blockquote naming every real file, the
  `notify`-not-`hr` placement, and both decisions above — the same
  discipline this session applies to every other document's own build.
- New spec files (`bulletins.service.spec.ts`,
  `bulletin-notification.listener.spec.ts`) cover the document's own
  Acceptance criteria directly: reach-bounded publish authority, exactly
  one `BulletinPublished` event per publish, an idempotent acknowledge
  proven by a second `P2002` being swallowed, and a retraction that
  archives rather than deletes.

### Status
**Accepted.**
