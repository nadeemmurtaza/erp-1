# ADR-055 — Doc 117 (choreography and idempotency) and doc 118 (headless, composable, agent-consumable capabilities): both theses stand, but doc 117's own worked-example table was three-quarters fabricated, and doc 118 (plus doc 115, its own source) cite a deferred model as already shipped

[← Decision log](../DECISIONS.md)


### Context

Two more architecture-patterns documents needed inspection: doc 117 (why
this repository's idempotency strategy is domain-keyed rather than a
generic event-ID ledger) and doc 118 (why "headless, composable,
agent-consumable API" is already this repository's shape, extended one
step by doc 116's proposed MCP adapter). Both documents' *theses* turn out
to be sound engineering positions; both documents' own *evidence* for
those theses turns out to be substantially wrong on inspection.

### Decision — doc 117: three of four cited "already exists" mechanisms do not exist

Doc 117's own table named `OrderEconomics` (doc 68), `BulletinAcknowledgement`
(doc 61), `LotAllocation`/`FaceMatchVerification`, and `BomProductionLineLot`
(doc 71) as four already-real domain-keyed idempotency guards. Checked
against the actual schema and code: only `OrderEconomics` is real
(`finance.prisma`'s `orderId String @id`, confirmed). The other three cite
sketches from documents that were never built and carry no `Status:` note
of their own — `61-policy-communications-bulletin.md` and
`71-recipe-batch-traceability.md` are both proposals with their own
unexecuted work-order lists; `Lot`/`LotStock`/`LotAllocation` (doc 32, the
document 71 itself depends on) has no Prisma model anywhere in this
codebase; `FaceMatchVerification` matches nothing at all — the only related
string in the whole codebase is a doc-comment on an *extension point*
noting a `FaceMatchProvider` is "not in this codebase yet." Doc 117's own
argument (a business-invariant unique constraint catches more than a
generic event-ID ledger ever could) did not need these citations to be
true — it needed *some* real ones, which the corrected table now supplies:
`findPostedEntry(source, sourceRef)` (the GL posting guard used across
`accounting`/`finance`/`wallet`), `LoyaltyLedger`'s own
`@@unique([orderId, type])` (its schema comment already calls this "the
actual guard"), `AttendanceEvent`'s `@@unique([userId, source, externalRef,
occurredAt])`, and this session's own newly-shipped `IdempotencyKey`
(doc 157, ADR-054) — the same principle's newest and purest instance,
since it is the one case a business-invariant unique key exists *before*
any row does.

### Decision — doc 118: `ApiClient` (doc 34) is cited as shipped; it is explicitly deferred

Doc 118 repeatedly cites "doc 34's `ApiClient`" as the mechanism already
scoping an agent or third-party caller's permissions. Doc 34's own header
says otherwise, in its own words: "The `ApiClient` below... is the
**service account** that [ADR-037] deliberately defers... Nothing below
is built." The mechanism this repository actually shipped instead is doc
163's personal `ApiKey` (also ADR-037): owned by a `User`, capped by that
user's own live `permissionKeys`/`customerScopes` (drawn from
`PERMISSION_CATALOG`/`CUSTOMER_SCOPE_CATALOG`), with a mandatory
`expiresAt` and revoked when its owner is deactivated — a personal,
user-bound credential, not a separate organisation-level principal that
outlives its creator. Doc 118 also repeated a second, unrelated error
carried over verbatim from doc 115 (which this document quotes as a
source): `OrdersService.createFromPos()` does not exist — the real method
is `placeFromPos()`. Doc 115's own table has the identical wrong name,
missed by its own earlier "corrected" pass (ADR-052's era), which fixed
five fabricated ports/adapters but not this one; fixed here too, since it
was found while verifying the document that quotes it.

Doc 116 (which doc 118 also quotes, for its `McpToolDefinition` design)
repeats the same `ApiClient` citation and carries no `Status:` note of its
own. Its correction is intentionally left for when doc 116 is itself
verified — this entry fixes what doc 117 and doc 118 assert, not every
document either one cites, matching this batch's own standing rule
(ADR-052's doc 128 in miniature: fix the document actually being
inspected, name the sibling's error rather than silently absorbing the
fix into an unrelated pass).

### Reasoning

Both errors are instances of the same failure mode this whole
architecture-patterns set keeps surfacing: a document's own "already
exists" claim is only as good as the last time anyone actually checked it
against the codebase, and a sibling document's *sketch* — code presented
inside a proposal, complete with a Prisma `model` block and a plausible
method signature — reads exactly like real code to a later document that
cites it without re-verifying. Doc 117 cited three sketches as shipped;
doc 118 cited a model its own source document explicitly labels
unbuilt. Neither error was contained to its own document: doc 118 and
doc 115 shared the identical wrong method name, and doc 116 carries the
same `ApiClient` mistake doc 118 does — evidence that a wrong citation
propagates forward through "cites doc N's own finding" chains exactly as
easily as a correct one does, which is the argument for verifying at the
point of citation, not trusting the citation's own age or apparent
authority.

### Consequences

- Doc 117's thesis is now backed by five real, checkable citations
  instead of one real and three fabricated ones — a future reader
  verifying "is idempotency really domain-keyed here" finds working code
  at every link.
- Doc 118 and doc 115 no longer send a future reader looking for
  `OrdersService.createFromPos()`, which does not exist.
- The real service-account gap (doc 34's `ApiClient`, deliberately
  deferred) and the real shipped mechanism (doc 163's `ApiKey`) are now
  correctly distinguished in doc 118 — a future agent-integration effort
  building on this document will design against the credential this
  repository actually has, not one that was explicitly set aside.
- Doc 116's own `ApiClient` citation is now a known, named, open
  correction for whenever that document is next inspected — not
  rediscovered from scratch.

### Status
**Accepted.**
