# ADR-027 — The three highest-risk items from ADR-026 withdrawn: no WASM sandbox, no service mesh, no dedicated crypto microservice

[← Decision log](../DECISIONS.md)


### Context
ADR-026 recorded the owner's explicit, twice-reconfirmed instruction to
build all seven mechanisms docs 104/105/107/113/114/125/126 had
independently declined, including three flagged in that same ADR as
requiring the `security` subagent's own review before any production
traffic could depend on them: a general WASM sandbox for executing
partner-authored formulas (doc 144), a service mesh (doc 145), and a
dedicated cryptography microservice (doc 146). Before that review took
place, the owner reconsidered the actual security exposure these three
specifically carry — arbitrary code execution against real business
data, a new inter-service trust boundary, and a standalone service
holding every password hash's own verification secret — and asked that
all three be removed, stating plainly that the original request had
misjudged the risk.

### Options Considered
1. **Keep all seven as ADR-026 recorded them**, proceeding to the
   `security` subagent's own review of docs 144–146 before implementation.
   Rejected: the owner's own reconsideration is new evidence overriding
   the *build* decision for these three specifically, arriving before any
   implementation or review work began — there is nothing to review if
   the owner no longer wants the capability built.
2. **Keep the specifications on record as withdrawn-but-documented**
   (mark superseded, retain the files) **vs. delete them outright.**
   Retaining a fully-specified WASM sandbox or crypto-microservice design
   in the repository, even labeled "withdrawn," is itself a standing
   temptation and a maintenance burden for a capability nobody intends to
   build — unlike ADR-026's own seven items, which were live disagreements
   with real alternatives already shipping, these three have no shipped
   code depending on them and no alternative document that needs to point
   at their design details.
3. **Delete docs 144, 145, and 146 outright**, restore docs 114, 125, and
   126 to stating their own original recommendation as this repository's
   current position, and record the reversal here.

### Decision
**Option 3.** Docs 144, 145, and 146 are deleted. Docs 114, 125, and 126
are updated to state that their own original recommendation (a restricted
expression evaluator; the zero-trust principle without a mesh; an
in-process `PasswordHasher` interface) is this repository's current,
standing position, with a pointer to this ADR for the history. The other
four items from ADR-026 (docs 140–143: EAV, the metadata-UI engine, BPMN,
micro-frontends) are unaffected — they carry real but ordinary
engineering trade-offs, not the specific class of security exposure
(arbitrary code execution, a new trust boundary, centralized key
material) that prompted this reversal, and the owner did not ask for them
to be reconsidered.

### Reasoning
An owner recognizing and correcting a misjudged risk is exactly the kind
of new evidence this repository's own "don't repeatedly revisit a settled
decision without new evidence" rule is written to respect — the same
principle ADR-026 itself invoked to justify building these seven items
over the original engineering recommendation now justifies un-building
the three riskiest of them. Deleting the specification documents rather
than leaving them as "withdrawn but present" keeps the repository from
carrying a fully-designed blueprint for capabilities that would need
their own the `security` subagent review before anyone should build them
in the future — a future decision to revisit any of these three starts
from a fresh scoping pass against whatever the actual requirement is at
that time, not from a two-owner-decisions-old design.

### Consequences
- Docs 144, 145, and 146 no longer exist; `docs/implementation/README.md`'s
  own routing table is updated to remove them and to correct the
  144–146 range in its own section header to reflect only 140–143.
- Docs 114, 125, and 126 each carry a short status note pointing to this
  ADR, rather than to a deleted document — a citation to a nonexistent
  file would be a broken reference this repository's own `pnpm check:links`
  discipline exists to catch.
- Doc 128's own `IdentityProvider`/`ShippingCarrier` ports, doc 126's own
  `PasswordHasher` interface, and every other extension point in this
  repository remain the actual, standing mechanism for the legitimate
  underlying needs (algorithm agility, third-party integration) these
  three withdrawn items were never the only way to serve.
- If a genuine future requirement needs sandboxed third-party code
  execution, a service mesh, or a dedicated crypto service, that request
  is scoped fresh, against the actual requirement at that time, and
  routed through the `security` subagent's own review from the start —
  never resumed from these deleted documents' own design.

### Status
**Accepted.**
