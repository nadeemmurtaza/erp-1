# 11 · Workflow

Processes with a hundred steps, several actors, days of elapsed time, and a
wrong outcome that costs real money.

> **Status: unbuilt as a system.** The product has long processes today —
> checkout, stitching jobs, stock counts, inter-branch transfers, purchase
> orders — and each implements its own stepping, its own draft handling and
> its own status vocabulary. There is no shared workflow primitive, no
> resumption guarantee, and no machine-checked "this flow has no dead end".
> This chapter is the specification for one, and the laws are binding on
> anything built meanwhile.

## The thing that actually goes wrong

A long workflow does not fail by being ugly. It fails in five specific ways,
and every law in this chapter exists to close one of them:

| Failure | What it looks like | Closed by |
|---|---|---|
| **The dead end** | a state with no forward action and no marked exit | `FLO-1`, `FLO-2` |
| **The lost hour** | work done and not recoverable — a closed tab, a timeout, a crash | `FLO-3`, `FLO-4` |
| **The silent branch** | the flow forked and the user does not know which path they are on | `FLO-5`, `FLO-8` |
| **The carried value** | step 90 needs a number from step 6 and does not show it | `FLO-6` |
| **The unexplained refusal** | "cannot proceed" with no statement of what would allow it | `FLO-7` |

Each of these is an *ordinary* bug in a five-step flow and a *catastrophic*
one at a hundred steps, because the cost of re-doing the work scales with the
work already done. That asymmetry is the whole reason this chapter exists.

---

## FLO · The laws

### FLO-1 · Every state has a forward action and a marked exit
**Here** — for every state a workflow can reach, two things are true: there
is at least one action that advances or resolves it, and there is a way out
that is not the browser's back button. A state with neither is a dead end,
and a dead end in a hundred-step process is unrecoverable work.

**The test** — enumerate the states. Not "click around and see": if the
states cannot be enumerated, the flow does not have a state machine, it has
accumulated conditionals, and `FLO-8` already forbids that.

### FLO-2 · Back is never destructive, and never a lie
**Here** — moving backward in a flow preserves what was entered forward of
it. If a backward step genuinely invalidates later work (changing the
supplier invalidates the price list), **say so before moving, name what will
be lost, and let the user decide** — `ACT-6`'s tiering applies.

A "Back" that silently discards is worse than no Back at all, because the
user trusted it.

### FLO-3 · Work is durable from the first meaningful action
**Here** — a draft exists server-side from the moment the first real value is
entered, not on submit. Autosave on step change, and on blur within a long
step. The rule: **closing the tab may cost the current field, never the
current hour.**

A draft is a first-class object. It has an owner, a status, an age, and a
place it can be found from — see `FLO-4`.

### FLO-4 · An unfinished thing is findable without its URL
**Here** — every draft, every paused count, every half-approved order appears
in a list its owner can reach by clicking. Never only at a URL. This is
`COG-9` (Zeigarnik) made structural: an interrupted task that cannot be found
is not interrupted, it is lost.

**Corollary** — drafts age, and a stale draft is a liability in a system
where stock and price move. A draft older than its domain's tolerance is
shown as stale and re-validated on resume, never silently submitted against
figures from last week.

### FLO-5 · Position is always answerable
**Here** — at any point the interface answers three questions without the
user asking: **where am I, how much is left, and what happens when I
finish.** In a hundred-step flow, steps are grouped into named stages
(`COG-3`, `COG-10`), and progress is shown as stages and steps completed —
never an invented percentage.

Stage names are business language (`HEU-2`): "Pricing", "Approvals",
"Dispatch" — never "Step 4 of 12".

### FLO-6 · A step carries its own context
**Here** — a step never requires the user to remember a value from an earlier
step. If step 90 needs the quantity agreed at step 6, step 90 shows it, with
a way back to where it was set. This is `COG-2` as an enforceable rule, and
it is the difference between a long flow that is tedious and one that is
dangerous.

**Corollary** — the summary before the irreversible action restates
everything that will be committed. Not a link to it. It.

### FLO-7 · A refusal states its remedy
**Here** — every blocked state names **what is blocking, who or what can
unblock it, and what the user can do now.** "Awaiting approval" is a status,
not a message. "Awaiting approval from the Finance department — submitted
2 days ago — [remind]" is a message.

This is `HEU-9` applied to process rather than to errors, and in a product
with 250+ roles it is the law that prevents a queue of people each waiting
for someone they cannot identify.

### FLO-8 · The state machine is explicit, and the user sees fewer states
**Here** — a workflow's states, transitions and guards are declared, not
implied by conditionals scattered across components. Internal state machines
legitimately have more states than a user should see; **the mapping from
internal state to user-facing label is part of the design**, decided once,
not per screen.

Two rules follow: a status shown to a user is a translated label, never an
enum; and two screens never name the same internal state differently
(`HEU-4`).

### FLO-9 · Long flows are interruptible by design, not by accident
**Here** — a hundred-step process will be interrupted: a shift ends, a
customer walks up to the till, a supplier calls back. **Design the
interruption**: the flow can be left at any step boundary, its state is
legible to someone else who picks it up, and resuming does not restart
validation from step 1.

### FLO-10 · Hand-off is a first-class step
**Here** — when a workflow moves between people or departments — and with a
hundred departments it will — the hand-off carries: who it went to, why, what
they are expected to do, and what the sender said. An item that arrives in
someone's queue with no context becomes a question, and a question in a
hundred-step process is a day.

### FLO-11 · Every committed action is attributable and reconstructable
**Here** — for anything that moves value, the record answers **what happened,
who did it, why it was allowed, and what the state was at that moment.** A
status field that is overwritten is a status log, not an audit trail.

This is a design law, not only a data one: the screen that shows the object
must be able to show its history, and the history must be readable by a
person who was not there.

### FLO-12 · Parallel is shown as parallel
**Here** — when several things must happen and their order does not matter,
**do not draw a line through them** (`PER-7`). A sequence implies a
dependency; showing four independent approvals as steps 7, 8, 9 and 10
teaches a false model and creates artificial waiting.

### FLO-13 · A dry run precedes an expensive commit
**Here** — for any action that is wide (a bulk price change, a stock
revaluation, a branch transfer of hundreds of lines), the user can see
exactly what will change before committing: counts, totals, and the
exceptions. `HEU-5` says prevention beats messaging; a dry run is prevention
at the only moment that matters.

### FLO-14 · Time is shown where time matters
**Here** — a process that spans days shows elapsed time, not just status. "In
review" is different from "In review for 9 days", and only the second one
prompts action. Where an SLA or a cut-off exists, it is on the screen.

### FLO-15 · The end of a flow is designed
**Here** — `COG-13`. A completion states what was created, what it means,
what happens next, and offers the next likely action. It never returns the
user to an empty list. A hundred steps ending in a toast is a hundred steps
the person will dread next time.

---

## Patterns

### The wizard — and when not to use one

A wizard is correct when the steps are **ordered, dependent, and completed in
one sitting by one person**. Most long processes in this product are none of
those.

| Shape | Use | Because |
|---|---|---|
| **Wizard** | ordered, dependent, one sitting, one person | linear guidance is the point |
| **Checklist** | unordered, independent, one owner | a sequence would be a lie (`FLO-12`) |
| **Queue** | one step, many items, repeated | the user's job is throughput, not progress |
| **Case file** | long-lived, many actors, days | the object is the subject, not the steps |

**A hundred-step process is almost never one wizard.** It is a case file with
stages, each stage a small wizard or checklist, each independently resumable.
Forcing it into one linear wizard produces exactly the failure this chapter
opens with.

### Stages, not steps

Group steps into stages of about five to nine (`COG-2`, `COG-3`). A stage is
a unit of completion: it can be finished, left, and returned to. The user
tracks three or four stages, not a hundred steps — which is the only way the
number stays within working memory.

### Form laws inside a step

Research is unambiguous here, so these are not preferences:

- **One column.** Multi-column forms break the top-to-bottom reading path;
  users fill fields out of sequence and trigger avoidable errors.
- **Labels above fields**, always visible. Never placeholder-as-label: it
  disappears exactly when the user needs it, and destroys error recovery.
- **Inline validation**, on blur, not on every keystroke and not only on
  submit. Validation at submit produces the highest error rates and the
  longest completion times of any placement.
- **Errors below the field they belong to**, with room reserved so the layout
  does not jump.
- **Constrain rather than validate** (`HEU-5`). A picker cannot produce an
  invalid date.
- **Never block paste** (`ACC-5`).

### The irreversible commit

The last screen before money moves, stock moves, or a document is issued:

1. Restates every value being committed (`FLO-6`) — not a link to them.
2. States what becomes true and what becomes impossible.
3. Names the blast radius in numbers: *"1,240 lines, 3 branches, Rs 4.2m"*.
4. Applies `ACT-6`'s tier — and at this size, that means typing the object's
   name.
5. Is not adjacent to a benign action (`ACT-2`).

### Offline and the till

The POS runs where the network does not. Two rules override everything above:

- **A sale that already happened is never rejected by sync.** It is recorded,
  reconciled, and surfaced as an exception for a human — never silently
  dropped, and never blocked at the till because a server disagreed.
- **Queued and failed are different states, always distinguished.** "Not yet
  sent" is normal; "sent and refused" needs a person. Showing them the same
  way is how a shop discovers at close of day that nothing saved.

---

## What must be built

Named, so it is sequenced rather than assumed:

1. **A workflow primitive** — stages, steps, guards, and a declared state
   machine (`FLO-8`), so flows stop each inventing their own.
2. **A draft/resume contract** — one way drafts are created, found, aged and
   revalidated (`FLO-3`, `FLO-4`).
3. **A reachability check** — every declared state has a forward action and an
   exit (`FLO-1`), verified by a command rather than by clicking. Chapter 15
   specifies it.
4. **A status vocabulary** — the internal-to-user-facing mapping
   (`FLO-8`), held once, so two screens cannot disagree.

Until those exist, these laws are binding on review, and a long flow built
without them is carrying the risk this chapter names.

---

## Sources

- [Complex approvals — UXPin](https://www.uxpin.com/studio/blog/complex-approvals-app-design/) · [modern approval workflow components](https://velt.dev/blog/approval-workflow-components)
- [Workflow engines and state machines](https://www.intelligentgraphicandcode.com/development/workflow-engines) · [building approval workflows](https://letmepost.dev/blog/approval-workflows)
- [Approval audit trails for enterprise governance](https://www.sirion.ai/library/contract-insights/approval-audit-trail-explained/)
- [Save-and-resume multi-step wizard patterns](https://appmaster.io/blog/save-and-resume-multi-step-wizard) · [multi-step form design](https://www.weweb.io/blog/multi-step-form-design)
- [Form design — Baymard](https://baymard.com/blog/form-design) · [never use inline labels](https://baymard.com/blog/mobile-forms-avoid-inline-labels) · [what form UX research actually says](https://fomr.io/blog/form-ux-best-practices)
- [Confirmation dialogs — NN/G](https://www.nngroup.com/articles/confirmation-dialog/) · [dangerous actions — Smashing](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/)
- [Progressive disclosure in complex flows](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
