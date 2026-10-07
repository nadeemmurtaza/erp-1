# 46. No lens asks what a quorum/dual-custody/second-signature control does when the deployment's roster can't supply the second person

Every quorum, dual-custody or second-signature control this catalogue
demands — the top-band ladder in *The threshold nobody approves alone* (04),
Ruling 6's abandoned `PosShift` needing a second cash-count holder — states
the requirement, never the fallback. Built literally, Solo's two or three
staff can permanently lock a purchase order or a till; built loosely, an
implementer improvises a silent single-approver bypass indistinguishable
from a real quorum pass once the roster grows. Corporate scale needs both
halves designed.

## Lens: The quorum of one

**Question:** For Ruling 6's abandoned-`PosShift` close and for the top-band
quorum in *The threshold nobody approves alone* (04), name the fallback
state a control moves to when the deployment's live roster has fewer
distinct qualified holders than the control requires, the field recording
that this was a shortfall pass rather than a genuine quorum pass, and the
permission key that authorises invoking it.

**Why:** `PosShiftStatus` (`apps/api/prisma/schema/pos.prisma:52-55`) has
exactly two values, `OPEN` and `CLOSED` — Ruling 6's own "named abandoned
state" requiring a second cash-count holder does not exist in the schema
yet, so the ruling that introduces the two-person requirement ships with no
answer for a Solo deployment (two or three staff, one location, no
accountant) that cannot supply that second holder. `PurchaseOrderStatus`
(`purchasing.prisma:88-94`) is `DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED` — no
approval gate exists yet either, so 04's quorum has nowhere to attach today.
This is distinct from lens 44's composition question (which of a person's
several grants governs one act): that asks what happens with too many
applicable grants, this asks what happens with too few qualified people.

**Worked example:** Narrow slice: implement Ruling 6 literally —
`closeShift()` (`pos-shifts.service.ts:72`) requires a distinct second
holder of a cash-count permission to close an abandoned shift, so a Solo
terminal staffed by one cashier on a late shift stays abandoned forever, and
the next morning's `openShift()` refuses because the terminal is not
`ACTIVE` (`pos-shifts.service.ts:35-36` already throws on any non-`ACTIVE`
terminal). Complete capability: an `ABANDONED` status a single qualified
holder can resolve, but only by writing a stored marker (e.g.
`resolvedAsSingleHolder: true`) alongside the variance row, so the record
stays distinguishable from a genuine two-person close in every later audit.

**Done test:** `grep -n "ABANDONED" apps/api/prisma/schema/pos.prisma` finds
a new status value paired with a column recording single-holder resolution
(name, type and default stated in the PR); and `pos-shifts.service.ts`
names a permission key distinct from the ordinary close path that gates
invoking the fallback, not `pos.operate` reused silently.

**Breaks without:** A Solo branch's till sits `ABANDONED` past the next
shift's open, with `PosTerminal.status` blocking `openShift()` and no legal
way to trade — the exact "branch that cannot trade tomorrow" failure. Or an
implementer lets any single holder close it with no distinguishing field,
so an Org-tier auditor reviewing the same terminal four years and forty
branches later cannot tell a genuine two-person reconciliation from a
Solo-era exception silently baked into production history.

## Lens: The count nobody keeps

**Question:** For any permission key a quorum or dual-custody control will
require two or more distinct holders of, name the service method that
returns how many distinct users currently hold that key deployment-wide
today — and if none exists, name the nearest check that comes close and
what it actually verifies instead.

**Why:** `RolesService.assertLockedPermissionsStillHeldSomewhere`
(`apps/api/src/core/auth/roles.service.ts:261`) is the only place in the
codebase that reasons about how many people hold a permission, and it only
refuses a role edit, or `assertLockedKeysStillHeldAfterRevoke` (`:175`) a
revoke, that would drop an `ADMIN_LOCKED_PERMISSIONS` key's holder count to
zero — it never checks for one. An admin can edit two roles in sequence and
silently collapse a two-person quorum permission to a single remaining
holder, and nothing refuses it, because the check that exists asks "does
anyone hold this" rather than "do enough distinct people hold this for the
control it backs."

**Worked example:** Narrow slice: ship the top-band PO quorum (04) trusting
that two role holders exist because seed data happened to grant the
permission to two people at setup. Complete capability: a
`countDistinctHolders(key)` query that the quorum check calls before
allowing any fallback path, and that `RolesService`'s edit/revoke path also
calls for any key marked quorum-bearing — refusing the edit the same way
`assertLockedPermissionsStillHeldSomewhere` already refuses on zero, just at
the threshold the specific control needs instead of one.

**Done test:** `grep -rn "countDistinctHolders\|holderCount"
apps/api/src/core/auth` finds a real method, and `roles.service.ts`'s edit
and revoke paths call it for any permission key marked quorum-bearing, not
only the two `ADMIN_LOCKED_PERMISSIONS` entries.

**Breaks without:** A role edit or a `UserPermission` REVOKE silently drops
a two-person quorum permission to one live holder; the next top-band
purchase order either cannot be approved (stuck in `DRAFT`, per
`PurchaseOrderStatus`) or is waved through by whichever single-approver
bypass an implementer improvised — with `RolesService`, the one place that
already counts holders, never having been asked to check the number that
specific control needs.

## Lens: The record that must outlive its own excuse

**Question:** When a fallback single-approver pass is recorded because the
roster couldn't supply a control's second signer, name the column storing
how many qualified holders actually existed at that moment, and what a
report run after the deployment's roster has grown past that number does
with rows still carrying the old justification.

**Why:** R14 states an edition upgrade is never a migration and every tier
concept stays invisible until it applies, so a Solo-era fallback record
cannot be silently reinterpreted once Org-tier headcount exists. Nothing in
this codebase stores that context today: `JournalEntry`
(`accounting.prisma:120-140`) has no approval state or actor column at all,
and no `Approval`/`ApprovalStep` model exists anywhere in the schema
(confirmed absent by lens 44). This is distinct from "The version stamp"
(`WO-22-lens-workflow-results.md:279`), which versions the *rule* so a
recomputation matches a record's own stored policy version; this stores the
*roster size* that permitted departing from the rule, a fact no rule
version number can reconstruct.

**Worked example:** Narrow slice: a `wasFallbackApproval: true` boolean on
the approval record, with no roster context. Complete capability: the
record also stores `requiredHolders` and `actualHolders` at approval time,
so a report run after the branch count crosses from 3 to 40 can separate
"correctly single-approved because the roster genuinely had one holder"
from "should have been blocked, wasn't" — without re-deriving headcount
from since-changed role assignments.

**Done test:** The PR names the table and the
`requiredHolders`/`actualHolders` column pair on any new fallback-approval
record, and names a report or query that filters fallback rows by the
roster size recorded at approval time, not by today's roster size.

**Breaks without:** An Org-tier internal auditor reviewing years-old
approvals cannot distinguish a legitimate Solo-era single-approver exception
from a control that was simply never wired — the only trace is a boolean
with no roster context, exactly the "no flag an Org-tier auditor... could
use" failure this gap names.

## Not modelled yet

- No `ABANDONED` (or equivalent) status on `PosShiftStatus` — only
  `OPEN`/`CLOSED` exist (`pos.prisma:52-55`); Ruling 6's own fallback state
  is a ruling, not code.
- No approval-gate status on `PurchaseOrderStatus`
  (`DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED`, `purchasing.prisma:88-94`) —
  04's quorum ladder has nowhere to attach yet.
- No method anywhere that counts distinct holders of a permission key —
  `RolesService` checks only for zero holders of `ADMIN_LOCKED_PERMISSIONS`.
- No `Approval`/`ApprovalStep` model, and no column on any model recording
  the roster size in force at the time of an approval.

## Hardening record

**Kept (3 of 3):**

- **The quorum of one** — confirmed `PosShiftStatus`
  (`apps/api/prisma/schema/pos.prisma:52-55`) has only `OPEN`/`CLOSED`, that
  `closeShift()` (`apps/api/src/modules/sales/pos/pos-shifts.service.ts:72`) has no
  second-holder check to relax, and that `openShift()`
  (`pos-shifts.service.ts:35-36`) already throws on any non-`ACTIVE`
  terminal — so a stuck `ABANDONED` state is a real, traceable dead end, not
  a hypothetical. Kept because it is a scope question (what state and column
  the schema needs) distinct from lens 44's composition question (which of
  several grants governs one act): this is about too few qualified people,
  not too many applicable grants.
- **The count nobody keeps** — confirmed
  `assertLockedPermissionsStillHeldSomewhere`
  (`apps/api/src/core/auth/roles.service.ts:261`) and
  `assertLockedKeysStillHeldAfterRevoke` (`:175`) only refuse a role edit or
  revoke that would drop an `ADMIN_LOCKED_PERMISSIONS` key's holder count to
  *zero* — no method anywhere counts distinct holders against a quorum
  threshold above zero. Kept because it names a real, missing method and the
  exact two call sites that would need to call it, not a general "add a
  check" restatement.
- **The record that must outlive its own excuse** — confirmed no
  `Approval`/`ApprovalStep` model exists and `JournalEntry`
  (`apps/api/prisma/schema/accounting.prisma:120-140`) carries no approval
  actor or roster-size column. Kept as distinct from "The version stamp"
  (`docs/implementation/WO-22-lens-workflow-results.md:279`), which versions
  the *rule* so a stored figure can be recomputed from a record's own policy
  version; this lens asks for the *roster headcount* that justified a
  departure from the rule, a fact the rule's version number cannot supply.

**Killed:** none. All three name a distinct artifact (a status value plus a
resolution marker, a holder-counting method with two call sites that must
call it, a column pair plus the report that filters on it) that a narrow
build of any quorum control in this catalogue would omit, and none restates
the five CLAUDE.md lenses, the thirty WO-22 lenses, or lens 44's composition
question.

**Corrections:**

- Claimed the version-stamp comparison lens as local file "(19)" — this
  repository's own `docs/erp-lenses/NN-*.md` numbering (used correctly
  elsewhere in this file for Ruling 6, and in lens 44 for "(04)" and "(42)")
  has no file 19 about version stamps; `19-channels-franchise-wholesale.md`
  is a different lens entirely. "The version stamp" has no numbered file of
  its own — it lives at `docs/implementation/WO-22-lens-workflow-results.md:279`
  as the 19th lens in that document's own list. Corrected the citation to
  point there directly instead of implying a local file number.
- `pos-shifts.service.ts` citations were given as a bare filename with no
  path; verified the actual path is
  `apps/api/src/modules/sales/pos/pos-shifts.service.ts` (not `apps/api/src/pos/...`)
  and confirmed `closeShift` at line 72 and the `ACTIVE` check at lines
  35-36 match exactly. Filled in the full path in this Hardening record for
  traceability; left the lens bodies' bare-filename form as-is since it was
  never a wrong path, only an incomplete one.
