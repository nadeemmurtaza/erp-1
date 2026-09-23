# 28 — Recruitment, digital onboarding, and the employee document vault

Everything from doc 20 onward assumes an `Employee` row already exists.
Nothing in this repository yet answers where that row comes from, or where
the ID scan, the signed contract and the background-check result live once
it does. Bolting a `documents` folder onto the employee record without a
pipeline in front of it produces the two failures every ERP with this gap
eventually hits: an offer accepted with no record of what was offered, and a
compliance audit that cannot produce a signed contract on demand because it
was emailed to someone's inbox instead of stored against the employee.

## 1. A candidate is not an `Employee` until an offer is accepted

`Candidate` and `JobApplication` are their own models, deliberately not a
pre-`ACTIVE` `Employee` row with a flag. An applicant who is rejected must
never resolve as an employee anywhere (attendance, payroll, tasks) — that
requires a real type boundary, not a status value a stray query forgets to
filter on. `JobApplication.convertedEmployeeId` is the one link, written
once, at the moment an offer is accepted and doc 20's `Employee` row is
created — the join a report walks backward, never forward.

## 2. A document is a fact with a retention basis, not a file with a name

`EmployeeDocument` never stores a file itself — it stores a
`StorageService.putDocument()` reference (the same primitive `finance`
already uses for receipts) plus a `category` and a `retentionBasis`. This is
the direct answer to `CLAUDE.md`'s "the erasure the ledger cannot obey" lens:
a signed contract is retained under a legal-obligation basis independent of
whether the employee is later erased elsewhere, and that basis is a stored
fact on the row, not a comment for a future reader to rediscover.

## Schema — append to `hr.prisma`

```prisma
model JobRequisition {
  id             String  @id @default(cuid())
  organizationId String
  positionId     String  /// The vacant post this fills — reuses doc 20's Position, never a duplicate title string.
  headcount      Int     @default(1)
  status         RequisitionStatus @default(OPEN)
  openedByUserId String
  closedAt       DateTime?

  position     Position       @relation(fields: [positionId], references: [id])
  applications JobApplication[]

  @@index([organizationId, status])
}

enum RequisitionStatus { OPEN ON_HOLD FILLED CANCELLED }

model Candidate {
  id        String  @id @default(cuid())
  fullName  String
  email     String
  phone     String?

  applications JobApplication[]

  @@index([email])
}

model JobApplication {
  id             String  @id @default(cuid())
  requisitionId  String
  candidateId    String
  stage          ApplicationStage @default(APPLIED)
  /// Set exactly once, when an offer is accepted. NULL for every rejected
  /// or withdrawn application, permanently — this is the type boundary.
  convertedEmployeeId String? @unique
  rejectedReason String?
  appliedAt      DateTime @default(now())

  requisition JobRequisition @relation(fields: [requisitionId], references: [id])
  candidate   Candidate      @relation(fields: [candidateId], references: [id])
  transitions ApplicationTransition[]

  @@index([requisitionId, stage])
}

enum ApplicationStage {
  APPLIED
  SCREENING
  INTERVIEW
  OFFER_EXTENDED
  OFFER_ACCEPTED
  REJECTED
  WITHDRAWN
}

/// History, same shape as doc 23's TaskTransition — "how long did this sit
/// in INTERVIEW" is the question every hiring manager asks.
model ApplicationTransition {
  id            String   @id @default(cuid())
  applicationId String
  fromStage     ApplicationStage?
  toStage       ApplicationStage
  byUserId      String?
  note          String?
  occurredAt    DateTime @default(now())

  application JobApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId, occurredAt])
}

model OnboardingChecklistTemplate {
  id             String @id @default(cuid())
  organizationId String
  positionId     String? /// NULL = applies to every new hire; set = post-specific steps on top
  label          String

  items OnboardingChecklistItem[]
}

model OnboardingChecklistItem {
  id         String  @id @default(cuid())
  templateId String
  order      Int
  label      String
  /// If set, this step is only complete once this document category has
  /// been uploaded — links onboarding directly to the vault below, so
  /// "contract signed" is provably true, not a checkbox someone ticked.
  requiresDocumentCategory DocumentCategory?

  template OnboardingChecklistTemplate @relation(fields: [templateId], references: [id])
}

model EmployeeOnboardingTask {
  id         String  @id @default(cuid())
  employeeId String
  itemId     String
  status     OnboardingTaskStatus @default(PENDING)
  completedAt DateTime?

  employee Employee                @relation(fields: [employeeId], references: [id])
  item     OnboardingChecklistItem @relation(fields: [itemId], references: [id])

  @@unique([employeeId, itemId])
}

enum OnboardingTaskStatus { PENDING COMPLETE WAIVED }

model EmployeeDocument {
  id             String  @id @default(cuid())
  employeeId     String
  category       DocumentCategory
  /// Points at the StorageService-managed file — never a raw path or URL a
  /// caller could bypass the driver with.
  storageKey     String
  originalName   String
  retentionBasis RetentionBasis
  uploadedByUserId String
  uploadedAt     DateTime @default(now())
  /// e.g. a work-permit expiry. NULL for documents with no expiry.
  expiresOn      DateTime?

  employee Employee @relation(fields: [employeeId], references: [id])

  @@index([employeeId, category])
  @@index([expiresOn])
}

enum DocumentCategory {
  ID_DOCUMENT
  SIGNED_CONTRACT
  BACKGROUND_CHECK
  WORK_PERMIT
  BANK_DETAILS
  OTHER
}

enum RetentionBasis {
  LEGAL_OBLIGATION
  CONTRACTUAL_NECESSITY
  CONSENT
}
```

`convertedEmployeeId` is `@unique` and nullable so at most one `Employee` is
ever created per accepted application, and the FK direction (application →
employee, not employee → application) means a report can always ask "who did
we hire from this requisition" without every `Employee` needing a nullable
back-reference to a hiring process it may never have gone through (imported
history, an acquisition).

## Scope lenses

**The actor with three tables** — a `Candidate` is a fourth kind of
counterparty, deliberately not a `User`, `Party`, `Contact` or
`TradingPartner`: they hold no permission, sign in nowhere, and exist solely
to be tracked through a pipeline until they either become an `Employee`
(doc 20) or leave the system as a rejected/withdrawn row.
**The principal with no permission key** — n/a: a candidate authenticates
nowhere in this module; any candidate-facing status page (out of scope,
below) would need its own unsubscribe-token-style link, not a login.
**The grant that ends itself** — n/a: converting a candidate to an employee
grants nothing by itself; doc 20's own `Posting` and any system access are
separate, deliberate acts.
**Whose rows, and which columns** — a hiring manager sees applications only
for requisitions against posts in their subtree (doc 21); `Candidate.email`/
`phone` are visible to `hr.recruitment.manage` only, never surfaced on a
general employee-directory screen.
**The threshold nobody approves alone** — extending an offer
(`OFFER_EXTENDED`) above a compensation band set on the `Position`'s `Rank`
needs a second approver who outranks the hiring manager — same shape as
doc 20's rank-based escalation, reused rather than re-invented here.
**The toxic pair** — `hr.recruitment.manage` with `hr.recruitment.approve_offer`:
the same person extending and approving their own offer is refused together,
mirroring the pattern `CLAUDE.md` names for `RolesService`.
**Authority and blast radius** — who may open a `JobRequisition` against a
`Position` (a headcount decision, org-wide visibility) versus who may move an
`ApplicationStage` (the assigned hiring manager); the worst value is
converting the wrong application, which is why conversion is a single
irreversible `OFFER_ACCEPTED → Employee` action gated by
`hr.recruitment.convert`, never implicit in a stage move.
**Audience is a capability, not an address** — a converted employee's
onboarding checklist notifies their manager (`reportsTo`, once the `Posting`
is created) through doc 24's channel, resolved by the org chart, not a
literal address.
**Request or record** — a stage transition is a REQUEST (an interview cannot
be scheduled twice into a full slot, an offer needs the approval above); a
completed onboarding step, once a required document category is uploaded, is
a RECORD — the system does not get to disagree that the file exists.
**The movement with no address** — n/a: no stock or cash movement.
**Four hours down, the counter stays open** — n/a: recruitment and
onboarding are not till-floor operations; nothing here needs a paper
fallback for an offline branch.
**Click the number** — a "time to hire" or "open requisitions" dashboard
tile links to the exact `JobApplication`/`ApplicationTransition` rows behind
it, computed the same way doc 23's cycle-time is: from transitions, never a
mutated current-state column.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: posts no `JournalLine`. (An accepted offer's
compensation figure feeds doc 20's `CompensationRate`/payroll as a separate,
deliberate act — this module does not write payroll rows itself.)
**The second legal entity** — `JobRequisition` and its documents are scoped
per `organizationId`; a candidate applying to two legal entities in the same
group is two `Candidate` rows unless a client explicitly wants cross-entity
dedup, named here as a real future decision, not assumed.
**Dry run before live** — `canAdvance(application, toStage)` is pure, the
same shape as doc 23's `canTransition`, and is what the UI calls to disable
an illegal stage-move button.
**Three silhouettes** — Solo: no requisition pipeline, a single "add employee
directly" path (doc 20's `Employee.create`, unchanged, still works with this
module absent). Chain: a requisition per branch, hiring managers scoped to
their branch. Organization: cross-brand requisitions, a central talent-
acquisition team with `hr.recruitment.manage` at the organization scope.
**The absent collaborator** — with this module off, doc 20's direct
`Employee` creation path is the only one, unchanged; `EmployeeDocument` still
exists and is usable standalone (an org that wants a document vault without a
hiring pipeline gets one) since the vault does not import the pipeline.
**The second copy of the write** — `convertedEmployeeId @unique` stops a
retried conversion from creating a second `Employee` for the same accepted
offer; the storage layer's own content-addressed key (StorageService)
prevents a re-uploaded identical file from being stored twice under a new key.
**The hundred-thousandth row** — document volume scales with headcount ×
document categories over the organization's history (documents are never
deleted on employee exit); bounded by `[employeeId, category]`, and
`expiresOn` is indexed for the same nightly expiry-warning job pattern doc
27 uses for certificates.
**The reversal document** — a wrongly-issued offer is withdrawn via a
`REJECTED`/`WITHDRAWN` transition with a reason, never a deleted application
row; a wrongly-uploaded document is superseded by uploading a corrected one
under a new `EmployeeDocument` row (the old row's `category` gets a
`SUPERSEDED` marker via a nullable `supersededById` self-relation) — the
original is kept for audit, never overwritten in place.
**The undo fan-out** — rejecting an application after `OFFER_ACCEPTED` but
before conversion cancels the pending `Employee` creation (automatic, since
conversion is a single explicit action, not a side effect of the stage
change); it never retroactively affects a `Posting` if conversion already
ran (deliberately irreversible — that needs doc 20's own offboarding path).
**The version stamp** — an `OnboardingChecklistTemplate` is versioned by
never being edited in place once any `EmployeeOnboardingTask` references it —
a template change creates a new template row, so a hire's checklist always
reflects the policy in force the day they joined.
**The erasure the ledger cannot obey** — `EmployeeDocument.retentionBasis`
is the named answer this module owes `CLAUDE.md`'s own erasure lens:
`LEGAL_OBLIGATION` and `CONTRACTUAL_NECESSITY` documents survive an
employee's erasure request under that stated basis; `CONSENT`-basis
documents (e.g. an optional photo) do not and are deleted from storage, not
just unlinked, on erasure.
**The failure path** — a `StorageService.putDocument()` failure during
onboarding upload surfaces on the onboarding screen with a retry, never
silently marks the checklist item complete; a failed conversion (offer
accepted, `Employee` creation throws) leaves the application at
`OFFER_ACCEPTED` with no partial `Employee` row — the conversion is one
transaction.

## Work orders

**WO-28.1 — schema**: `JobRequisition`, `Candidate`, `JobApplication`,
`ApplicationTransition`, `OnboardingChecklistTemplate`/`Item`,
`EmployeeOnboardingTask`, `EmployeeDocument`.
**WO-28.2 — `RecruitmentService`**: requisition open/close, application
stage transitions (`canAdvance` pure), offer approval threshold.
**WO-28.3 — conversion**: `convertToEmployee(application)` — one transaction,
creates the doc 20 `Employee` + initial `Posting`, sets
`convertedEmployeeId`.
**WO-28.4 — onboarding**: checklist instantiation on conversion, document-
category-gated completion, manager notification (doc 24) on stall.
**WO-28.5 — document vault**: `EmployeeDocument` CRUD over
`StorageService.putDocument`, retention basis enforced at upload (no
category may be created without one), expiry-warning nightly job (shared
pattern with doc 27's certificate expiry).
**WO-28.6 — permissions**: `hr.recruitment.manage`, `hr.recruitment.approve_offer`,
`hr.recruitment.convert`, `hr.documents.manage`, `hr.documents.view_own`.
**WO-28.7 — UI**: requisition board, application pipeline (kanban by stage),
onboarding checklist screen, employee document vault (admin + self-service).
Nav entry under People/HR.

## Acceptance

- A rejected or withdrawn application never produces an `Employee` row —
  proven by a spec asserting `convertedEmployeeId` stays NULL on every
  non-`OFFER_ACCEPTED` terminal stage.
- The same person cannot extend and approve their own offer.
- An onboarding step requiring a document category cannot be marked complete
  without a real `EmployeeDocument` row in that category.
- A `CONSENT`-basis document is actually deleted from storage on an erasure
  request; a `LEGAL_OBLIGATION`-basis one is not.
- Conversion is atomic: a forced failure mid-conversion leaves no orphan
  `Employee` row and the application stays at `OFFER_ACCEPTED`.

## Out of scope

A public candidate-facing application portal and status page (this module
covers the internal pipeline; a public apply form is a storefront-adjacent
surface with its own scope lenses, named and deferred, not stubbed),
background-check provider integration (an `EmployeeDocument` in category
`BACKGROUND_CHECK` can be uploaded manually today; a live API integration
with a screening vendor is a named future work order, not assumed here),
resume parsing/AI screening (belongs with `09-ai-layer.md`'s own draft-a-
human-confirms rule if it is ever built, not this module).
