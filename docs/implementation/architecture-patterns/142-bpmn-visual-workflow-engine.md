# 142 — A BPMN visual workflow engine, built by explicit owner override (ADR-026), as a diagram layer over the existing typed engine, never a replacement for it

> **Status: shipped (2026-09-26), WO-142.1/142.2/142.3.** `Bpmn
> WorkflowDefinition` (`bpmn-workflows.prisma`) + `compileBpmnToApprovalSteps()`
> + `BpmnWorkflowsService` are live. No `organizationId` (the same
> ADR-044/ADR-040 correction already applied to docs 104/140/141/143;
> recorded in `DECISIONS.md` ADR-049 alongside the other corrections
> below).
>
> **`ApprovalChain`/`ApprovalStep`/`ApprovalSubjectType`/`ApprovalService.
> decide()` were verified to exist exactly as this document assumes**
> (`apps/api/prisma/schema/approvals.prisma`, `core/approvals/approval.
> service.ts`) before any code was written — `ApprovalService.start()` is
> the one existing entry point this document's compiler now feeds.
>
> **The compiler (WO-142.1) is a hand-written, dependency-free parser for
> the narrow supported subset** (extraction via regex over the `<process>`
> element's own children, an explicit tag allowlist, a directed-graph walk
> over `sequenceFlow`), not a general XML/BPMN library — this repository
> already had no XML parsing dependency, and the supported subset is
> narrow enough that adding one was not justified. Any element outside
> `{process, startEvent, endEvent, sequenceFlow, task, userTask,
> extensionElements, documentation, incoming, outgoing}` is rejected by
> name — a gateway of any kind, a timer or message event, a script/service
> task, a sub-process. **"Simple branching," named in this document's own
> §1, is narrowed to strictly linear**: a real approve/reject branch
> already exists inside `ApprovalService.decide()` itself (a REJECT skips
> every remaining step automatically), so a workflow author never needs a
> visual gateway to express one — supporting a real BPMN gateway would
> mean building exactly the second interpreter this document's own §1
> refuses to become.
>
> **A task node's approver is its own `name` attribute** — the permission
> key a step is expected to be decided under (e.g.
> `"purchasing.requisitions.approve"`, matching `RequisitionService`'s own
> existing hardcoded convention for `approverRoleId`), or `"user:<userId>"`
> for one specific approver. This is a pragmatic reading of doc 142's own
> "change the approver role for a step," not a BPMN-native concept — BPMN
> has no standard "approver" attribute, and adding a custom moddle
> extension plus a properties panel was judged unjustified complexity for
> what a plain task name already expresses cleanly.
>
> **Reached by `purchasing`'s `RequisitionService` through a new
> `WorkflowStepsRegistry` extension point** (`core/extension-points/
> workflow-steps.registry.ts`), never a direct cross-module import — the
> identical seam `BranchPolicyRegistry` already uses between `purchasing`
> and `organization`. A subject type with no saved diagram (or the
> `bpmn-workflows` module absent) falls back to `RequisitionService`'s own
> existing hardcoded single-step default, unchanged; a diagram is
> additive, never load-bearing.
>
> **`bpmn-js` (18.30.1) is a new dependency, added to `apps/web` only**,
> per `.claude/rules/dependencies.md`'s own justification (recorded next to
> `BpmnEditor`'s own import in `bpmn-editor.tsx`): the well-established
> open-source BPMN.js-shaped editor this document's own WO-142.2 requires,
> mounted via `useRef`/`useEffect` as a vanilla-JS widget, never a
> controlled React tree. The admin editor is at Settings > Approval
> workflows (`settings.bpmn-workflows.manage`).

Doc 63 built `ApprovalChain`/`ApprovalStep` as typed, reviewed TypeScript;
doc 107 declined a BPMN engine on top of it three times, because a second,
interpreted way to express the same class of logic means two mechanisms
doing one job, forever. Per ADR-026, the owner instructed this be built
anyway, so a non-technical manager can redraw an approval or routing
workflow without an engineering deploy. This document builds it with the
one design choice that keeps doc 107's own risk bounded: **the BPMN
diagram is a visual editor for `ApprovalChain`'s own existing data model,
never a second execution runtime.**

## 1. BPMN as a view over `ApprovalChain`, not a competing engine

```ts
// A BPMN diagram's nodes map onto ApprovalStep's own existing fields —
// the diagram IS the editor, ApprovalService.decide() remains the ONLY
// thing that ever executes a step. No BPMN interpreter runs in
// production; the diagram is compiled, at save time, into the identical
// ApprovalChain/ApprovalStep rows doc 63 already defines.
interface BpmnWorkflowDefinition {
  subjectType: ApprovalSubjectType;   // reuses doc 63's own enum, never a parallel one
  diagramXml: string;                 // the visual editor's own saved BPMN XML — a display/authoring artifact
  compiledSteps: Array<{ stepOrder: number; approverRoleId?: string; approverUserId?: string }>;
}

function compileBpmnToApprovalSteps(diagramXml: string): CompiledSteps {
  // Parses ONLY the subset of BPMN this repository supports: a linear or
  // simple branching sequence of "approval" task nodes. Any BPMN
  // construct this repository does not execute (a timer boundary event,
  // a parallel gateway, a script task) is REJECTED at compile time with a
  // specific error — never silently ignored, and never executed by a
  // second interpreter this document does not build.
}
```

This is the deliberate, structural answer to doc 107's own "two ways to
express business logic" risk: there is still only **one** way business
logic executes — `ApprovalService.decide()`, typed, tested, reviewed.
BPMN is a drawing tool that produces the identical rows a form-based admin
screen would also produce; it is not, and must never become, a second
runtime interpreting the diagram live.

## 2. What this buys, and what it deliberately still refuses

- **What it buys**: a non-technical manager can redraw a chain's shape
  (add a tier, change the approver role for a step) in a visual tool,
  compiled into the same rows doc 63's own admin form already writes —
  genuinely faster iteration for the one thing doc 63 always said was
  policy (tier count and resolution rule), with no code deploy, exactly
  the promise doc 96 already delivers through a plainer form and this
  document now also delivers through a diagram.
- **What it still refuses**: a BPMN construct doc 63's own typed engine
  cannot execute stays rejected at compile time, never "supported" by
  silently falling back to some improvised interpretation. This is the
  one non-negotiable boundary keeping this feature from quietly becoming
  the general-purpose workflow runtime doc 107 explicitly declined —
  the diagram's expressive power is capped at exactly what
  `ApprovalService` can already do, not expanded to match BPMN's own
  full specification.

## Scope lenses

Not repeated in full — doc 63's own scope lenses already answer every
lens for the underlying `ApprovalChain`/`ApprovalStep` execution; this
document adds only an authoring surface over the identical rows.
**The version stamp** (worth restating): a diagram edit compiles into a
new set of `ApprovalStep` rows applied to chains started *after* the
edit, per doc 63's own already-stated versioning discipline — an
in-flight chain finishes under the shape it started with, unaffected by
a later diagram redraw.
**The failure path** (the one genuinely new lens this document adds): a
diagram containing an unsupported BPMN construct fails to save, with an
error naming exactly which node type is unsupported — never silently
accepted and never executed by an ad hoc fallback interpretation.

## Work orders

**WO-142.1 — `compileBpmnToApprovalSteps()`**: parses the supported BPMN
subset (linear/simple-branching approval task sequences only), rejecting
anything else at compile time.
**WO-142.2 — UI**: an embedded BPMN diagram editor (a well-established
open-source BPMN.js-shaped editor, never a bespoke diagram tool built
from scratch), wired to save through WO-142.1's own compiler.
**WO-142.3 — `BpmnWorkflowDefinition`** schema, storing the diagram XML
alongside its compiled `ApprovalChain`/`ApprovalStep` output for
round-trip editing (a manager reopens the diagram and sees their own
last-saved shape, not a lossy re-derivation from the compiled rows).

## Acceptance

- A diagram compiles into `ApprovalStep` rows identical in shape to what
  doc 63's own form-based admin screen would produce for the same policy.
- A diagram using an unsupported BPMN construct is rejected at save time
  with a specific, named error — proven by a spec.
- No BPMN interpreter runs against production approval decisions; every
  decision executes through `ApprovalService.decide()`, unchanged from
  doc 63 — proven by the absence of any runtime BPMN-execution dependency
  in the deployed service.

## Out of scope

Supporting BPMN's full specification (parallel gateways, timer events,
script tasks, message flows) — deliberately capped at what
`ApprovalService` can execute; expanding the supported subset is a future,
separately-scoped decision only if a concrete workflow shape this
repository's own engine genuinely cannot express is named, never assumed
in advance.
