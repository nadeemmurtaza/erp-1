# 144 — A general WebAssembly sandbox, built by explicit owner override (ADR-026), gated on a mandatory security review before any production use

Doc 114 recommended a restricted expression evaluator instead of a
general sandboxed code-execution runtime, because the two named examples
(commission formulas, shipping-weight logic) need only arithmetic, and a
general sandbox is real, ongoing attack surface for a need that small.
Per ADR-026, the owner instructed the general sandbox be built anyway,
for near-term flexibility as implementation partners bring requirements
this repository cannot fully anticipate today. **This document specifies
the sandbox's design and its mandatory guardrails; it does not authorize
production use of it.** Per this repository's own model-routing table
("Access control, isolation and money → `opus` at `max` effort, the
`security` subagent"), arbitrary third-party code execution against this
system's own data is exactly the class of decision that table exists to
route — this document is the design brief the `security` subagent
reviews before WO-144's own work orders are implemented, not a
substitute for that review.

## 1. What "sandboxed" must mean here, stated as non-negotiable requirements

A WASM module is real, Turing-complete executable code; "sandboxed" is
not automatic just because the runtime is WASM rather than native code.
Every one of the following is a requirement this design must satisfy
before any implementation ships, not an aspiration:

- **No ambient authority** — a WASM module receives *only* the specific
  input values (`FormulaContext`-shaped, per doc 114's own naming) its
  caller explicitly passes in. It has no access to `fetch`, no filesystem
  handle, no database connection, no environment variable, and no import
  of any host function beyond a narrow, explicitly-allowlisted set of
  pure math helpers (`round`, `min`, `max`, `abs`) — the WASI
  (WebAssembly System Interface) is **not** enabled; this is a pure
  computation sandbox, never a general-purpose scripting host.
- **Hard resource limits, enforced by the host, not the guest** — a
  maximum instruction count (fuel-based metering, per the chosen WASM
  runtime's own support for it — e.g., Wasmtime's fuel API), a maximum
  memory allocation, and a wall-clock execution timeout, all enforced
  from *outside* the sandboxed module, so a module that loops forever or
  attempts to allocate unbounded memory is forcibly terminated, never
  trusted to cooperate with its own limits.
- **No network egress, ever, from inside the sandbox** — a formula that
  needs external data receives it as a pre-fetched input value from its
  caller; it never makes its own outbound call, closing off exactly the
  class of risk (a formula that exfiltrates data or calls an attacker's
  server) a network-capable sandbox would carry.
- **Compiled and reviewed before registration, executed identically every
  time thereafter** — a partner submits WASM bytecode (or source in a
  supported language compiled to WASM at submission time), which is
  statically validated against the constraints above and stored; nothing
  is compiled or fetched dynamically at execution time from an
  unreviewed source.

## 2. The schema and execution boundary

```prisma
model SandboxedFormula {
  id             String   @id @default(cuid())
  organizationId String
  key            String   // "commission-tier-2026"
  wasmBytecode   Bytes
  /// The exact variable names this formula expects — validated against
  /// the caller's own FormulaContext at execution time; a formula
  /// referencing an undeclared variable is rejected before execution,
  /// never silently passed undefined.
  inputVariables String[]
  status         SandboxedFormulaStatus @default(PENDING_REVIEW)
  submittedById  String
  reviewedById   String?
  reviewedAt     DateTime?
  createdAt      DateTime @default(now())

  @@unique([organizationId, key])
}

enum SandboxedFormulaStatus { PENDING_REVIEW  APPROVED  REJECTED  SUSPENDED }
```

```ts
interface SandboxRunner {
  execute(formula: SandboxedFormula, inputs: Record<string, number>): Promise<{
    result: number;
    fuelConsumed: number;
    durationMs: number;
  }>;
}
```

`SandboxedFormulaStatus = PENDING_REVIEW` is the default for every
submission — **no formula executes against real business data before a
human reviewer sets it to `APPROVED`**, mirroring doc 30's own
`FaceMatchProfile`/revocation discipline and doc 143's own fragment-
attestation gate: a new piece of externally-authored logic entering this
system is always a reviewed, explicit trust decision, never an automatic
one.

## 3. The mandatory review gate, stated as this document's own central requirement

**No `SandboxRunner` implementation ships to production, and no
`SandboxedFormula` is ever set to `APPROVED` for use against real payroll,
pricing, or shipping calculations, without the `security` subagent's own
review of the actual runtime implementation** — the specific WASM
runtime chosen, its fuel-metering configuration, its host-function
allowlist, and a penetration test attempting sandbox escape. This
document specifies the *design* the review is performed against; it does
not itself constitute that review, and treating this document as
sufficient authorization to ship would defeat the entire reason this
gate exists.

## Scope lenses

**The actor with three tables** — the formula's own author is doc 20's
existing `User` (an implementation partner's own account); the sandbox
itself is infrastructure, not an actor.
**The principal with no permission key** — n/a: every submitter and
reviewer is an authenticated `User`.
**The grant that ends itself** — `SandboxedFormulaStatus = SUSPENDED`
stops execution immediately for a formula later found unsafe or
incorrect, the same kill-switch discipline every other trust boundary in
this repository already uses.
**Whose rows, and which columns** — a formula's own `wasmBytecode` is
visible only to `settings.formulas.review`-holders; an ordinary user
triggering a calculation never sees the bytecode, only its result.
**The threshold nobody approves alone** — moving a formula from
`PENDING_REVIEW` to `APPROVED` requires `settings.formulas.review`,
distinct from `settings.formulas.submit` — the submitter and the reviewer
are never the same principal, the identical toxic-pair-avoidance
discipline `ApprovalChain` (doc 63) already applies to self-approval.
**The toxic pair** — a formula's own submitter holding
`settings.formulas.review` for their own submission is the toxic pair;
enforced by `SandboxService.approve()` refusing a reviewer whose id
matches the formula's `submittedById`.
**Authority and blast radius** — the worst a malicious or buggy formula
can do is bounded by the sandbox's own resource limits (§1) and by
`inputVariables` validation — it cannot read or write anything outside
the specific numeric inputs and one numeric output its own contract
declares; the audit row is `AuditService`'s own log of every
review-status change, old value to new value.
**Audience is a capability, not an address / Request or record / The
movement with no address / Every column or none / The period that
already moved / The second legal entity** — n/a beyond what the
*calling* business calculation (a commission payout, a shipping charge)
already answers in its own originating document; this sandbox is an
input to that calculation, not a new money or stock fact of its own.
**The unwritten posting rule** — a sandboxed formula's own output feeds
into an existing, already-classified write (e.g., `PayRunLine`'s own
commission line) — this document adds no new posting rule, only a new,
tightly-bounded source for one input value.
**Dry run before live** — `SandboxRunner.execute()` is itself already
side-effect-free (a pure numeric computation, per §1's "no ambient
authority" requirement) — every execution is inherently a dry run in the
sense that it never writes anything itself; the calling business logic
decides what to do with the result, exactly the "the deciding function
takes inputs, returns the outcome, holds no `prisma.` write" discipline
`CLAUDE.md`'s own "Dry run before live" lens already requires.
**Three silhouettes** — Solo: essentially never used. Chain/Organization:
the plausible real case (an implementation partner needing genuinely
custom commission logic a data-row policy cannot express) — still rare,
still individually reviewed every time.
**The absent collaborator** — with no `SandboxedFormula` approved for a
given calculation, that calculation falls back to its own existing,
non-sandboxed default logic — a sandboxed formula is always an optional
override, never a required dependency of any core calculation.
**The second copy of the write** — n/a: `execute()` performs no write of
its own; idempotency belongs entirely to whatever caller uses its result.
**The hundred-thousandth row** — formulas are few, reviewed individually;
volume is bounded by how many distinct formulas are ever approved, never
by transaction volume.
**The reversal document / The undo fan-out** — suspending a formula stops
future use; it does not retroactively recompute any past calculation that
already used its result, per this repository's own "a past record keeps
the meaning it had when created" discipline.
**The version stamp** — a formula's own `key` is versioned by convention
(`commission-tier-2026`); a new tax year or policy change registers a
new, separately-reviewed formula rather than mutating an approved one's
own bytecode in place — an approved formula's bytecode is immutable once
approved, exactly like `Lot`/`TaxRate`'s own immutability-after-creation
discipline.
**The erasure the ledger cannot obey** — `submittedById`/`reviewedById`
hold people; on user deletion, follows doc 20's own stated basis, the
formula's own bytecode and review history retained as a compliance record
independent of the submitter's continued employment.
**The failure path** — a formula that exceeds its fuel/memory/time limit
is forcibly terminated and the calling business logic receives an
explicit `SandboxExecutionFailed` error — never a hung request, never a
silently wrong result treated as valid.

## Work orders

**WO-144.1 (blocked on `security` subagent review before any of the
following ship to production)** — select and configure a specific WASM
runtime (Wasmtime or equivalent) with fuel metering, memory limits, and
WASI fully disabled; implement `SandboxRunner`.
**WO-144.2 — schema**: `SandboxedFormula`, `SandboxedFormulaStatus`.
**WO-144.3 — `SandboxService`**: `submit()`, `approve()` (with the
self-review refusal above), `suspend()`, `execute()`.
**WO-144.4 — permissions**: `settings.formulas.submit`,
`settings.formulas.review`, seeded to distinct roles.
**WO-144.5 — a mandatory sandbox-escape penetration test**, run before
WO-144.1 is considered complete, and re-run on any change to the runtime
configuration.

## Acceptance

- No `SandboxedFormula` reaches `APPROVED` status without a reviewer
  distinct from its submitter, proven by a spec.
- A formula attempting to exceed its fuel/memory/time budget is
  terminated and reported as a failure, never silently truncated or
  allowed to complete, proven by a spec that deliberately submits such a
  formula.
- The `security` subagent's own review of the actual runtime
  configuration is completed and its findings addressed before
  `SandboxRunner` is wired into any real business calculation.

## Out of scope

Enabling WASI or any host function beyond the narrow pure-math allowlist
in §1 — explicitly refused; if a genuine future need requires broader
capability (e.g., calling another internal service from within a
formula), that is a new, separately-reviewed capability grant, never
assumed available by default. Executing untrusted formulas against
anything other than the numeric business calculations this document
scopes (e.g., formulas that could see personal data) — not built here,
and would require its own dedicated review given the materially larger
blast radius.
