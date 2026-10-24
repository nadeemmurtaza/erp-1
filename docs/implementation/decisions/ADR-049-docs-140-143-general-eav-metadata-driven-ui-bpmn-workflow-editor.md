# ADR-049 — Docs 140–143 (general EAV, metadata-driven UI, BPMN workflow editor, micro-frontend fragments): the four mechanisms `architecture-patterns/00-*` names as explicitly owner-overridden (ADR-026) against this repository's own engineering recommendation, built with the corrections that recommendation still turns out to require

[← Decision log](../DECISIONS.md)


### Context

`architecture-patterns/104-jsonb-eav-extensibility.md`, `105-metadata-
driven-ui-rendering.md`, `107-*` (visual workflow builder) and `113-micro-
frontend-embedding.md` each recommended a narrower, bounded mechanism over
the general form named in an original document set, for stated reasons
(untyped/unindexable EAV, an unmaintainable generic renderer, a workflow
engine this codebase's actual approval model doesn't need, and a real
Next.js version conflict for JS-level module federation). Per **ADR-026**,
the owner reviewed that reasoning twice and instructed the general forms
be built anyway, for flexibility as requirements are discovered that the
narrower forms cannot anticipate. Docs 140/141/142/143 are those four
general forms. This entry is not a re-litigation of ADR-026 — the owner's
override is accepted and each mechanism below is built — it records the
concrete corrections each one's own draft needed once checked against the
actual codebase, the same discipline already applied to every doc in this
batch.

### Decision — doc 140 (`EntityAttribute`, a general EAV model): no `organizationId`; `entityType` validated against `Prisma.ModelName`, not a hand-maintained list

Doc 140's own sketch required `organizationId` on `EntityAttribute`,
exactly the column ADR-044/ADR-040 already found wrong for doc 104's own
`CustomFieldDefinition` for the identical reason: `organization` is off by
default in every deployment today, and this deployment is itself the
tenant boundary. Removed, matching doc 104's own precedent exactly —
`@@unique([entityType, entityId, attributeKey])`, no organization column
anywhere in the model.

Doc 140 asks for "a runtime-checked (not compile-time) list of known
Prisma model names" to validate `entityType` against, without naming the
mechanism. `Prisma.ModelName` — the Prisma client's own auto-generated
enum-like object, regenerated from the schema on every `prisma generate` —
is exactly that list, and using it means there is no second array to keep
in sync with the schema by hand. `EntityAttributeService.setAttribute()`
and `.getAttributes()` both reject an `entityType` not in
`Prisma.ModelName` before touching the database.

`deleteAll(entityType, entityId)` is wired into `PurchasingService.
remove()` for `Supplier` — the same first worked example doc 104 used.
Built first as a direct import of `EntityAttributesModule` into
`PurchasingModule`; `check-module-boundaries.mjs` correctly refused this
(no module may import another directly, only core, per `MULTI-SECTOR.md`)
and named its own remedy — publish a domain event. Corrected to a new
`SupplierDeleted` domain event (`purchasing.supplier_deleted`):
`PurchasingService.remove()` publishes it, and a new
`EntityAttributeSupplierDeletedListener`, living inside `entity-attributes`
itself, subscribes — the module boundary is crossed from the
`entity-attributes` side, never the `purchasing` side, matching this
repository's own "packs reach core through domain events, never the
reverse" rule extended to the identical core-to-core case. No other entity
is wired yet; the next adopter of this mechanism must both wire its own
deletion path and publish its own equivalent event, exactly as doc 140's
own text names as a standing obligation rather than something this
document could automate away.

Authorization follows the same pattern as doc 104's `CustomFieldsController`:
a small, explicitly maintained `Record<string, PermissionKey>` map
(`ENTITY_TYPE_EDIT_PERMISSION` in `EntityAttributesController`) from entity
type to the permission that already gates editing that entity. An entity
type not on the map is refused outright — never defaulted to "any
signed-in user may edit," since `entityType` here carries no code-known
allowlist the way doc 104's own bounded mechanism does.

### Reasoning

Both corrections are the same rule applied twice: a mechanism the owner
asked to be built anyway is still built against this repository's own
already-settled facts (the single-tenant deployment boundary; a generated
registry over a hand-maintained one) rather than against a sketch's literal
schema. Overriding the recommendation to keep the mechanism narrow does not
override the separate, already-decided facts the narrower mechanism's own
schema happened to get right by accident.

### Consequences

- `EntityAttribute` composes cleanly with every other client-configurable
  table in this codebase — no dead `organizationId` column, no migration
  cost the day a second tenant concept is ever turned on for real.
- `Prisma.ModelName` validation means adding a new Prisma model
  automatically makes it a valid `entityType` with zero code change to this
  mechanism — the flexibility ADR-026 asked for, delivered without a
  parallel list to maintain.
- The maintenance obligation doc 140 names (`deleteAll()` must be wired by
  hand into every adopting entity's own deletion path) is real and remains
  real; this decision does not remove it, only names where it currently
  stands (`Supplier` only).

### Decision — doc 143 (micro-frontend fragments): no `organizationId`; WO-143.1's literal module-federation build substituted with doc 113's own iframe + embed-token pattern, reused rather than rebuilt

Doc 143's own sketch required `organizationId` on `MicroFrontendFragment` —
the same column already found wrong for docs 104 and 140, for the same
reason. Removed; `key` is `@unique` alone.

Doc 143's WO-143.1 asks for a `next.config.js` module-federation build
(`@module-federation/nextjs-mf`) wrapping the admin shell. Checked against
this repository's own facts rather than built from the sketch: this
repository's actual Next.js version is 15.5.23
(`apps/web/package.json`); `@module-federation/nextjs-mf`'s own GitHub
issue tracker has an open, unresolved request for Next.js 15 support, with
stated doubt about the package's own maintenance past 2026; and this
repository's admin app is already committed to the App Router, React
Server Components and Turbopack-first dev (doc 93's own architecture).
Building WO-143.1 as sketched would mean pinning this repository's own
framework upgrade path to an unmaintained third-party wrapper's own
compatibility window — a worse, harder-to-reverse trade-off than the
narrow capability the mechanism exists to deliver, and precisely the kind
of framework-version lock doc 93's own reasoning (cited at the top of doc
143) already warns against.

**WO-143.4 — the embed-token issuer from doc 113, reused unchanged as the
credential a federated fragment receives — already names the actual
composition layer this document needs.** Rather than build a second,
parallel mount mechanism through literal module federation, `Fragments
Service.issueFragmentToken()` and `FragmentMountPoint`/`FragmentFrame`
reuse doc 113's own iframe + short-lived, scoped JWT pattern
(`EmbedWidgetsService.issueEmbedToken()`'s own shape, a distinct `aud`
claim, a `sub` that is the fragment's own key) as the real mount
mechanism: a fragment is loaded into a named mount point exactly as
independently-deployed as literal module federation would have made it —
its own remote deployment, its own release cycle, no shared build step
with the admin shell — the two differ only in transport (an iframe boundary
instead of a webpack runtime boundary), and the iframe boundary is the
stronger isolation of the two, not a lesser substitute.

### Reasoning

The owner's override targets the *capability* (deploy a specialized
fragment independently of the admin app's own release train, opt-in per
fragment), not the specific *mechanism* named in doc 143's own sketch. The
sketch's own mechanism (JS-level module federation) is unsafe to build
today for a reason entirely orthogonal to ADR-026's own rationale — an
upstream package's Next.js 15 compatibility gap this repository does not
control and cannot fix by writing more code. Delivering the actual
capability through a mechanism this repository already owns, tests, and
can maintain (doc 113's iframe pattern) honors the override; silently
shipping a module-federation build known to be fragile against this
repository's own Next.js version would not — it would trade a documented,
working substitution for an undocumented, breaking one.

### Consequences

- `MicroFrontendFragment` composes cleanly with every other
  client-configurable table in this codebase, matching docs 104/140's own
  precedent.
- A registered fragment gets real independent deployability — its own
  vendor-controlled release cycle, no shared build step with the admin
  app — without this repository taking on a framework-version dependency
  it cannot verify is safe today.
- If `@module-federation/nextjs-mf` (or an equivalent) ships verified
  Next.js 15 support later, WO-143.1 can be revisited as an addition
  alongside the iframe mechanism, not a replacement forced by today's
  compatibility gap — named here so the substitution is not mistaken for
  a permanent rejection of the literal sketch.
- The design-law attestation this document requires at registration
  (`settings.fragments.manage`, a required `attestationConfirmed` field
  validated server-side) is unaffected by the mechanism swap: it gates
  registration itself, not the transport a registered fragment is mounted
  through.

### Decision — doc 140 build-time follow-up: `deleteAll()` wired through a new `SupplierDeleted` domain event, not a direct cross-module import

Building WO-140.3 (wire `EntityAttributeService.deleteAll()` into
`PurchasingService.remove()`) first imported `EntityAttributesModule`
directly into `PurchasingModule`. `scripts/check-module-boundaries.mjs`
correctly refused this: no module may import another module directly —
only core, and packs reach core through a domain event, never a direct
call. `entity-attributes` and `purchasing` are both `core` modules, so the
identical independence rule applies between them.

Corrected to a new `SupplierDeleted` domain event
(`DomainEvent.SupplierDeleted`, `purchasing.supplier_deleted`,
`{ supplierId }`): `PurchasingService.remove()` publishes it through the
existing transactional outbox (`EventBusService.publish()`), and a new
`EntityAttributeSupplierDeletedListener` — living inside `entity-
attributes`, not `purchasing` — subscribes via `@OnDomainEvent`. The
module boundary is crossed from the `entity-attributes` side only:
`purchasing` knows nothing about `entity-attributes` existing, exactly the
property `KNOWN_MODULE_COUPLINGS`'s alternative (a domain event) is meant
to preserve. At-least-once delivery is safe here without any extra
idempotency work: `deleteAll()` is a plain `deleteMany`, a no-op on redelivery.

### Decision — doc 141 (a general metadata-driven UI engine): no `organizationId`; the document's own "compose entirely from `@newax/shared`'s own primitive components" premise is corrected to this codebase's real, already-shipped form idiom

Doc 141's own sketch required `organizationId` on `FormMetadata` — the
same column already found wrong for docs 104/140/143, for the same reason.
Removed; `entityType` is `@unique` alone, and validated against
`Prisma.ModelName` at definition time, the identical mitigation doc 140
already established for the identical typo risk.

Doc 141's own central guardrail (§2) rests on a factual claim about this
codebase: "`renderMetadataForm()` may only ever call `@newax/shared`'s own
existing primitive components." Checked directly — `find packages/shared/
src -iname "*.tsx"` returns nothing. `@newax/shared` is a pure logic/
constants/types package; it has never had a React component in it. The
guardrail's own premise names a primitive set that does not exist.

This codebase's real, already-shipped, already-swept form idiom (`.claude/
rules/ui.md`'s own "Use what exists"; `custom-field-form-section.tsx`,
doc 105, built earlier in this same session) is plain semantic HTML
elements — `<input>`, `<select>`, `<label>` — styled through `.field-
label`/`.field-input`/`.field-check` (`apps/web/src/app/globals.css`).
`MetadataDrivenForm` (`metadata-driven-form.tsx`) is built against that
real idiom. The guardrail itself is not weakened by this correction — it
is retargeted at the risk doc 141's own text actually names ("a generic
renderer easily becomes a second, uninspected component library"), which
has nothing to do with which specific primitive set is real: **`scripts/
check-metadata-renderer.mjs`** (wired into `pnpm lint`, with its own
`--self-test`) fails if `metadata-driven-form.tsx` imports anything beyond
`@/types/api`'s own types, or uses an inline `style` prop — the two
concrete ways a second component library or a design-law bypass would
actually enter this one file. Doc 141's own acceptance criterion
describing the self-test as catching "a raw `<input>`" is corrected
alongside it: a raw `<input>` is the correct idiom here, not a violation.

WO-141.4's own "at least one representative metadata-driven form" is
`MetadataDrivenEntityForm`, reusing doc 140's own `EntityAttribute` rows
as value storage (never a second, parallel write path) and embedded on
the Supplier detail screen — a route `pnpm check:overflow` already sweeps
(`/admin/suppliers/[id]`, `scripts/check-overflow.mjs`'s own fixture
table), so extending that check's coverage to a metadata-driven form
needed no change to the check itself, per doc 66's own "extend an
existing check's coverage rather than assuming it" convention already
cited by doc 141.

### Reasoning

Both corrections are the same rule applied a third and fourth time
(after docs 104/140/143): a mechanism the owner overrode toward "build the
general form anyway" is still built against this repository's own
already-settled, checkable facts — the single-tenant deployment boundary,
a generated model-name registry, which package actually contains React
components, which existing check already sweeps a given route — rather
than against a sketch's own unverified claims. None of these facts bear on
whether the general form should exist; they bear only on what it is
correctly built out of.

### Consequences

- `FormMetadata` composes cleanly with every other client-configurable
  table in this codebase, matching docs 104/140/143's own precedent.
- The metadata-driven UI engine is enforced against this codebase's real
  design-system idiom, not an idiom that was never real — a future
  contributor extending `metadata-driven-form.tsx` gets an accurate,
  mechanically-enforced rule instead of one that would have permitted
  nothing at all (since no `@newax/shared` primitive to compose from ever
  existed).
- `entity-attributes` and `purchasing` stay fully independent modules per
  this repository's own module-pack architecture; a future entity
  adopting `EntityAttribute` must publish its own equivalent "deleted"
  event rather than import `entity-attributes` directly, and
  `check-module-boundaries.mjs` will catch it if it doesn't.

### Decision — doc 142 (a BPMN visual workflow engine): no `organizationId`; a hand-written compiler over a new dependency; "simple branching" narrowed to strictly linear; reached through a new `WorkflowStepsRegistry` extension point

Doc 142's own sketch required `organizationId` on `BpmnWorkflowDefinition`
— the same column already found wrong for docs 104/140/141/143, for the
same reason. Removed; `subjectType` is `@unique` alone, reusing doc 63's
own `ApprovalSubjectType` enum unchanged.

Before writing any code, `ApprovalChain`/`ApprovalStep`/
`ApprovalSubjectType`/`ApprovalService.decide()` were checked directly
against `approvals.prisma` and `core/approvals/approval.service.ts` —
doc 142's own assumption that these already exist, typed and reviewed, is
correct. `ApprovalService.start()` is the one existing write path this
document's own compiler now feeds; `decide()` is untouched.

**WO-142.1's compiler is hand-written and dependency-free**, not built on
a general XML or BPMN library. This codebase had no XML-parsing dependency
before this document; the supported subset (§1's own "linear or simple
branching approval task sequences only") is narrow enough — a handful of
element types, no nested content model to speak of — that a small,
directly-testable regex-and-graph-walk parser (`bpmn-compiler.ts`) covers
it completely without one. An explicit tag allowlist rejects everything
else by name (a gateway of any kind, a timer or message event, a script or
service task, a sub-process), exactly the "REJECTED at compile time with a
specific error" the document itself asks for.

**"Simple branching" is narrowed to strictly linear.** A visual gateway
would let an author express a real fork, but `ApprovalService.decide()`
already has its own approve/reject branch built in — a REJECT
unconditionally skips every remaining step, with no gateway needed to say
so. Supporting an actual BPMN gateway would require this compiler to
interpret conditional flow, which is exactly the second interpreter doc
142's own §1 states must never exist. The subset is capped at what the
existing typed engine can already do, per the document's own "Out of
scope."

**A task node's approver is read from its own `name` attribute** —
`"purchasing.requisitions.approve"`-shaped for a role, or
`"user:<userId>"` for one specific person — matching
`RequisitionService`'s own pre-existing hardcoded convention for
`approverRoleId` exactly (`const APPROVER_PERMISSION =
'purchasing.requisitions.approve'`, unchanged elsewhere in this codebase).
BPMN has no native "approver" concept; a custom moddle extension plus a
`bpmn-js-properties-panel` integration was considered and rejected as
unjustified complexity — a task's own name already carries the identical
information a form-based admin screen would collect in a labelled input,
with no additional UI dependency.

**Reached through a new extension point, not a direct import.** Building
WO-142.3's wiring into `RequisitionService.create()` by importing
`BpmnWorkflowsModule` into `PurchasingModule` would repeat the exact
mistake doc 140's own build-time follow-up (above) already made and
corrected — `bpmn-workflows` and `purchasing` are both `core` modules, so
the same independence rule applies. `WorkflowStepsRegistry`
(`core/extension-points/workflow-steps.registry.ts`) is the seam instead,
built the same shape as `BranchPolicyRegistry`: `bpmn-workflows` registers
a handler in its own `onModuleInit()`; `RequisitionService` calls the
registry, which answers `null` when no handler is registered or no
diagram is saved for a subject type, and `RequisitionService`'s own
pre-existing hardcoded single-step chain is the safe, always-available
fallback either way — a diagram is additive, never load-bearing.

**`bpmn-js` (18.30.1) is a new dependency**, added to `apps/web` only, per
`.claude/rules/dependencies.md`'s own required justification (recorded in
full next to its import in `bpmn-editor.tsx`): the well-established
open-source BPMN 2.0 editor doc 142's own WO-142.2 explicitly names as
required, in place of a bespoke diagram tool. It mounts imperatively via
`useRef`/`useEffect` as a vanilla-JS widget owning its own DOM subtree,
never as a controlled React component tree, so it carries no React-version
coupling of its own.

### Reasoning

Every correction here is the same rule applied a fifth time (after docs
104/140/141/143): a mechanism the owner overrode toward "build the general
form anyway" is still built against this repository's own already-settled,
checkable facts — the single-tenant boundary, which modules may import
which, what `RequisitionService` already hardcodes for its own approver
convention, what BPMN itself can and cannot natively express — rather than
against a sketch's own unverified assumptions. The one genuinely new
judgment call this document required (narrowing "simple branching" to
strictly linear, and encoding the approver in a task's own name rather
than a custom moddle extension) both trade a small amount of the sketch's
own expressive ambition for staying inside doc 142's own non-negotiable
boundary: no second interpreter, ever.

### Consequences

- `BpmnWorkflowDefinition` composes cleanly with every other
  client-configurable table in this codebase, matching docs 104/140/141/
  143's own precedent.
- No BPMN interpreter runs against a live approval decision — only
  `compileBpmnToApprovalSteps()`, called once, at save time; the acceptance
  criterion "no runtime BPMN-execution dependency in the deployed service"
  is satisfied by construction, since `bpmn-js` itself is a devDependency
  of nothing on the API side and never ships to the server bundle.
- A manager can redraw `PURCHASE_REQUISITION`'s own approval chain shape
  today, with no engineering deploy; `WALLET_ADJUSTMENT` (doc 155's own
  second `ApprovalSubjectType` consumer) is reachable through the identical
  mechanism the moment its own subject module reads
  `WorkflowStepsRegistry`, which it does not do yet — named here so it is
  not mistaken for already wired up.
- `purchasing` and `bpmn-workflows` stay fully independent modules; a
  future `ApprovalSubjectType` consumer wires itself into
  `WorkflowStepsRegistry` the same way, never by importing
  `bpmn-workflows` directly.
