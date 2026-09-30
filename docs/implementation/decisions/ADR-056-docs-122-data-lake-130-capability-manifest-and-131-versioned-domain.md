# ADR-056 — Docs 122 (data lake), 130 (capability manifest) and 131 (versioned domain events): one more fabricated citation, one more deferred-model repeat, one small real work order actually shipped

[← Decision log](../DECISIONS.md)


### Context

Three more architecture-patterns documents needed inspection. Doc 122
argues a data lake is premature at this repository's current scale and
names the measurable trigger for revisiting that; doc 130 proposes a
live, machine-readable capability manifest for programmatic API
discovery; doc 131 names the naming convention for a breaking domain-event
shape change. None had been checked against the live codebase before this
pass.

### Decision — doc 122: one citation corrected, thesis unaffected

Doc 122 cited `doc 71's BomProductionLineLot` as an example of a real
table with a documented expected row count, alongside doc 60's headcount
series and doc 79's `AssetAssignment`. ADR-055 already established that
`BomProductionLineLot` does not exist anywhere in this codebase — doc 71
is an unbuilt sketch. Corrected to `doc 22's AttendanceEvent` (built,
partitioned by month, ADR-046) — a real table with the identical
row-count discipline doc 122's own citation intends to demonstrate. The
document's actual thesis — no table has been documented as approaching a
size where indexing and partitioning stop being sufficient, and the
concrete trigger for revisiting a data lake is the two named conditions,
not a vague sense of scale — never depended on this specific citation and
is otherwise unaffected.

### Decision — doc 130: verified, deliberately left unbuilt

Doc 130 names three consumers for the capability manifest it proposes: an
AI agent via doc 116's MCP tool adapter, a hyperautomation platform via
doc 36's `OutboundConnector`, and "a future integration partner" via doc
34's `ApiClient`. All three are confirmed unbuilt: doc 116's own WO-116.1
is explicit that no adapter exists yet; doc 36 carries no `Status:` note
and `OutboundConnector` matches nothing in `apps/api/src`; doc 34's own
header says its `ApiClient` is the service-account model ADR-037
"deliberately defers... nothing below is built" (the same finding
ADR-055 already made correcting doc 118's identical citation). With zero
real consumers today, building a live introspection endpoint for them
would be exactly the speculative functionality CLAUDE.md's "No
speculative functionality" section forbids — matching the identical
reasoning already applied to doc 128's `ShippingCarrier.getRate()` and
doc 139's `AgentSessionGateway` (ADR-052, ADR-054). Marked verified with
no code built. Two corrections recorded for whenever a real consumer is
named and this is actually built: the sketch's `organizationId` parameter
repeats the recurring mistake ADR-044/040 already corrects throughout this
session (this deployment IS the tenant), and doc 128's own new ports are
named `IdentityProvider`/`CourierProvider` in the real code, not
`identity`/`ShippingCarrier` as the sketch had it — both fixed in the
document's own body, not just its Status note, so a future implementer
reads a self-consistent sketch.

### Decision — doc 131: WO-131.1 shipped; WO-131.2 deferred on a dependency that does not exist yet

Doc 131's own convention — additive event-shape changes are never a
version bump; a genuinely breaking change publishes under a new event
name (`OrderPlaced` → `OrderPlacedV2`) alongside the original for a
defined migration window, retired only once the generated
`docs/index/cross/events.md` shows zero remaining subscribers — is sound
and needed nowhere to be built to state. WO-131.1 ("record this convention
in `core/events`'s own README/header comment") is exactly that: a
documentation-only work order with no dependency on anything else, shipped
by adding the convention directly into `domain-events.ts`'s own existing
header comment, next to its "adding an event" guidance. WO-131.2 ("extend
doc 38's WO-38.5 contract-test suite" to flag a zero-subscriber
predecessor) cannot be built: doc 38 carries no `Status:` note and no
contract-test file exists anywhere in `apps/api/src` for WO-131.2 to
extend — WO-38.5 itself was never built. Deferred until WO-38.5 exists,
rather than building a speculative extension of a mechanism this
repository does not have.

### Reasoning

Doc 122 and doc 130 are the same lesson as ADR-055 in miniature, applied
twice more: a document's own evidentiary citations are only as reliable as
the last time anyone checked them, and a proposal that reads like shipped
code (a Prisma sketch, a plausible interface, a doc-comment reference)
keeps getting cited by later documents as though it already exists. Doc
130 in particular is the fourth instance this session of the identical
gating pattern (docs 128, 139, 116, now 130): a document proposes a real,
buildable mechanism whose only stated justification is future,
hypothetical callers — the correct answer every time has been to verify
the document's own reasoning holds, not to build ahead of a named
requirement. Doc 131 is the opposite case: a small, genuinely
independent, zero-dependency piece of its own work order was buildable
today and is now built, while a second work order that looked equally
small on the page turned out to depend on infrastructure (doc 38's
WO-38.5) that was never built — the "verify before building" discipline
catching a dependency gap as readily as a fabricated citation.

### Consequences

- Doc 122's own trigger-condition argument is now backed by a real table
  citation instead of a nonexistent one.
- Doc 130 is confirmed current — a future reader does not re-verify
  whether doc 116/36/34's own consumers exist before deciding not to build
  the manifest, and does not build it without first confirming a real
  consumer has been named; its own sketch is corrected in place so
  building it later starts from an accurate design.
- The next genuinely-breaking domain-event shape change in this
  repository has a stated, discoverable convention to follow
  (`core/events/domain-events.ts`'s own header), rather than an ad hoc
  decision made under deadline pressure.
- WO-131.2 is a named, open dependency on WO-38.5 rather than a silently
  dropped work order — whoever builds doc 38's contract-test suite next
  has a already-scoped follow-up waiting.

### Status
**Accepted.**
