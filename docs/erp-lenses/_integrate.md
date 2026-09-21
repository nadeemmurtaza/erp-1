# The backfill, and what it changed

Five critics re-read the finished catalogue from angles its generators could
not see: the org chart department by department, the roles-to-ranks chain
against the live source, the walk from one shop to a corporate group, what the
established suites force that this one does not, and this repository's own
recorded scars. Fifteen gaps were raised. **Eight** were carried into domain
files of their own, `38`–`45`, twenty-three lenses between them. The remaining
seven were never written; they are listed at the end of this file, so that
nobody reads the eight as the whole answer.

This file records where each one landed, what was promoted into the rule, what
was demoted to make room, and — for every lens not promoted — the reason.

## What was promoted: nothing

**The rule is unchanged.** `_claude-md-feature-scope.md` is the same 189 lines
it was before the backfill, and nothing was demoted, because nothing took a
place. That is the finding, not a failure to reach one: the section is not
improved by being longer, and none of the twenty-three beat a sitting lens on
**leverage** — the damage a lens's absence causes, times how often it fires.

The twenty-four sitting lenses fire on nearly every feature. Every one of the
twenty-three fails that second term, in one of two ways:

**Department-scoped — fires on one department's features** (`38`–`41`). Payroll
posting, maintenance scheduling, ESG measurement and contract terms are each
real, each blocking or significant in their own domain, and each silent on a
feature outside it. A reader walking all twenty-four on a stock-transfer change
would answer "n/a, this writes no pay run" four more times for no gain. This is
exactly what the catalogue is for — a lens kept for the surface it fires on —
and all four files' lenses are in it.

**Conditional on an artifact that does not exist yet** (`42`–`45`). The ceiling
composition rule, the rank axis and the manager edge cannot be answered until
there is a ceiling, a rank or an edge to answer about. Today the honest answer
to each is a line in *What this repository does not model yet*, which is where
it now is. Their normative content is not lost — it became four rulings, which
is the stronger placement: a ruling binds when the conflict arrives, without
costing attention on every feature until then.

### Lens by lens, and why each stayed out

| Lens | File | Why not promoted |
|---|---|---|
| The wage has no table | 38 | No compensation feature, no question. Prior to *The unwritten posting rule*, which already fires everywhere and would ask it in the one case it bites |
| The pay run is a document, not a report | 38 | One document's existence. *Request or record* and *The reversal document* already bound the general shape |
| The overpayment has no way back | 38 | Absorbed into *The reversal document, not the reversal flag* — it is that lens's line-level clause, not a rival |
| The service that has no due date | 39 | Fires on facilities features only. Nothing in a pricing or fulfilment change has a service interval |
| The department nobody notifies | 39 | Reachability is already a stated PR-failure condition in the rule's own review clause (a seeded grant, a nav entry) — this names the department instance of it |
| The lease nobody renews | 39 | Absorbed into *The agreement is not the row it governs*; a lease is one `kind` of agreement |
| The metric with nowhere to live | 40 | ESG-only. The grain question is real and has no reader outside a disclosure feature |
| Whose shipment, whose emissions | 40 | Same, narrower: it fires only where a figure is derived from transport |
| The disclosure period has no lock | 40 | The general form — a filed figure that must stop being editable — is *The period that already moved*, which sits in the rule. This is its non-ledger instance |
| The agreement is not the row it governs | 41 | Legal-only, and its consumers are a facilities list and a renewal job, not every feature |
| The renewal nobody is watching | 41 | A cron plus an audience. *Audience is a capability, not an address* already holds the reusable half, in the catalogue |
| The mint has no ceiling | 42 | **Blocking, and still not promoted.** It fires on the role-granting surface and nowhere else; on every other feature the answer is "grants no roles". Closest in shape to the cut *The trigger `AuditLog` doesn't have*: a real hole whose answer never varies and whose artifact is one signature change. Recorded as work, in *Not modelled yet*, and bound by ruling 14 |
| The un-grant checks less than the grant | 42 | Same surface, same reasoning. Ruling 14 settles it |
| The grant nobody can trace back | 42 | Absorbed into *Authority and blast radius*, which already demands the audit row carrying old and new; this extends what that row carries |
| The manager column that doesn't exist | 43 | **Blocking, and still not promoted.** *The threshold nobody approves alone* already asks who outranks whom, and *The grant that ends itself* already asks what happens to a pending decision. What this adds is that the answer be a row rather than prose — a correction to how those two are answered, which is ruling 11's job, not a twenty-fifth line |
| The chain HR actually needs | 43 | Absorbed into the above: the same edge, demanded by leave, reviews and headcount instead of by escalation |
| The ladder that must stay empty at Solo | 43 | Absorbed into *Three silhouettes, and the day the tier above appears*, whose clause it sharpens: **where** the column lives, not only whether it is nullable |
| The union that outruns its parts | 44 | Unanswerable until a ceiling field exists. Ruling 13 is waiting for it |
| Scope must gate the ceiling, not just widen it | 44 | Absorbed into the above — one rule with two clauses, not two rules |
| The act nobody can trace to its grant | 44 | Absorbed into *The version stamp*, which already asks whether a record can be explained from its own stored fields |
| Rank's own table, or a fused column | 45 | The premise it defends is already in the rule's own preamble ("ranks are not roles, and an approval ladder needs both"). What was wrong was a catalogue done test, and ruling 12 overturns it — see below |
| The number nobody can group by | 45 | Absorbed into the above: the reportability argument for the same choice |
| Escalation across roles needs a number, not a name | 45 | Absorbed into *The threshold nobody approves alone*, whose "who outranks whom" this makes numeric |

## What was merged

Twenty-three lenses: **fourteen** into the catalogue table as rows of their
own, **nine** absorbed, **none** cut. All twenty-three carry their editions.

Four of the nine absorptions are within the backfill itself — two lenses in one
file, or two files in one pass, reaching the same artifact from different
directions — and are recorded in *Catalogue merges*. The other five go into
lenses that already existed and are recorded under their canonical's own entry
in Part 2.

The table's totals moved from 154 rows to **177 rows for 169 lenses**: 24
headline, 83 catalogue, 58 absorbed, 4 cut, plus the 8 rows that repeat a
canonical under the name its own domain file still carries.

*What this repository does not model yet* gained the eight domains' absences —
compensation and pay-run artifacts, the maintenance and agreement models, the
whole environmental-metric grain, the granter's missing `actorId` seam, the
rank axis and the manager edge — including the fact that of
`PERMISSION_CATALOG`'s 50 keys not one matches `facilit`, `asset`,
`maintenance`, `lease`, `legal.`, `esg`, `sustainab` or `payroll`, and that
`NAV_GROUPS`' eight entries contain no facilities, legal or people group.

## The four rulings the backfill forced

Each of `42`–`45` collided with something already decided. The argument is
stated at length in `_conflicts.md` 11–14; the rulings are:

- **11.** Ruling 4 governs scope columns, not edges. An edge ships nullable,
  with null's meaning written down — and never inside a module that is off by
  default.
- **12.** Rank is its own axis. `Role.ceiling` is refused; a per-assignment
  override is allowed only above a rank.
- **13.** Scope-match first, then take the highest ceiling among the grants
  that survive. The skipped step is the bug, not the max.
- **14.** The guard refuses a revoke. It never refuses a deactivation — the
  deactivation names a successor.

### The one done test the backfill overturned

Ruling 12 supersedes lens 02's done test, which accepted "a numeric ceiling
column reachable from `Role` or `UserRoleAssignment`" as sufficient. It is not:
neither location builds the second axis the rule's own preamble requires, and
the catalogue may not hold a test that contradicts the rule it serves. This is
the only place the backfill changed a standing answer rather than adding one.

## Citations repaired during the merge

- `modules.registry.ts:66` → **`:81`**, in ruling 11, in Group 5's *Three
  silhouettes* entry, and in conflict 11. Line 66 is the `production` entry;
  the `organization` entry — the registry's only `offByDefault: true` — is line
  81, and the comment citing R14 by name runs `:77-80`. The hardening re-pass
  caught this inside file `43` and corrected it there; the same wrong range had
  already been copied into three normative paragraphs, which read the R14
  premise off a line that does not carry it.

Re-verified against source and correct as written: the 50-key
`PERMISSION_CATALOG` and its zero department matches; `NAV_GROUPS`' eight
entries; the seven document number counters, with `ReplicationSequenceCounter`
correctly excluded as a replication sequence rather than a document number;
`PartyRoleName`'s exactly four values; `Setting` as one global `key`/`value`
row with no `locationId`; `assertLockedKeysStillHeldAfterRevoke` wired only at
`users-admin.service.ts:297` while `RolesService.unassign()` is a bare
`deleteMany` at `roles.service.ts:155-157`; `scope.guard.ts:84` and `:124`;
`organization.prisma:43` and `:106-120`; `core.prisma:307` and `:336`;
`.env.example:33`; and `00b-ground-identity.md:50` carrying the
"no `managerId`, no `reportsTo`" language verbatim.

**Left alone, and reported rather than edited:** `00a-ground-topology.md:37`
states that `organization` and `transfers` are both togglable entries at
`modules.registry.ts:66,87`. Neither half holds today — `organization` is line
81, and `transfers` is not in the registry at all; `organization` is now the
only `offByDefault` entry. That line predates this pass and belongs to the
ground-truth files, so it is named here rather than rewritten from inside an
integration.

## The seven gaps that got no file

Of the fifteen raised, seven reached no lens and are in none of the artifacts.
They are recorded here as open, not as closed, because the catalogue now
carries eight backfill files and a reader could reasonably assume the audit was
worked to the end:

| Gap | Severity as raised | State |
|---|---|---|
| Group currency translation for consolidated reporting — presentation currency, translation method, rate source, the equity account taking the cumulative adjustment | blocking | No lens. `_index.md` still says only "No `FxRate` table and no period-end revaluation" |
| Financial close as a managed process — what must be true before `lockPeriod()` may run at all, not a permission check on the flip | blocking | No lens |
| A quorum or dual-custody control whose deployment roster cannot supply the second person | blocking | No lens. *The threshold nobody approves alone* asks for the quorum; nothing asks what it does at a roster of two |
| The per-brand currency field forces the invoice; nothing forces the ledger to convert — `JournalLine` minor units summed across currencies by `ConsolidationService` | significant | No lens |
| Landed cost apportionment and its timing — basis, and the freight bill arriving after COGS has already posted | significant | No lens |
| The approval that stalls without a leaver — a time-based escalation for a healthy approver who simply is not acting | significant | No lens. `04` covers only the deactivation and the expiring delegation |
| Replication data-class and direction (R2) for every new table, not only `Product` | significant | No lens. Only file `18`'s Product-shaped instance exists |

Three of those seven are blocking as raised. Nothing here judges them — they
were not put to the generate-and-harden pass at all, so there is no verified
lens to promote, absorb or cut. They are the next pass's input.

## What this merge did not do

It did not touch the twenty-four, and it did not lengthen the rule by a line.
The backfill's yield is four rulings, one overturned done test, fourteen new
catalogue rows, nine absorptions and a materially longer list of what this
repository cannot yet store an answer in. A reader walking the rule on their
next feature walks exactly what they walked before it.
