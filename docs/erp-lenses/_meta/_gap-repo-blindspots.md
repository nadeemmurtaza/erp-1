# Gap audit: the catalogue against this repository's own scars

**Angle.** Read `_index.md` and `_claude-md-feature-scope.md` against
`ENTERPRISE-SCALE.md`'s gap table, `RETAIL-ERP.md`'s rulings and roadmap, and
the code state those two documents cite — not against abstract ERP theory.
The question asked: what scope question has this repository already been
burned by, or explicitly flagged as unbuilt, that the 146-lens catalogue does
not yet ask of a *new* feature?

## What I checked and found already covered

Before trusting any candidate, I grepped the catalogue and the domain files
for the concept under another name. Most candidates that looked promising
turned out to already be asked, sometimes at a different altitude than I
first expected:

- **L2, branch-scoped reads** (`ENTERPRISE-SCALE.md` "gaps worth closing
  first" #1) — covered by **Whose rows, and which columns**.
- **S4, pack absence surviving boot** (gaps #2) — covered by **The absent
  collaborator**.
- **P2, undecorated routes** — closed in the repo itself
  (`check-route-permissions.mjs`); not a catalogue gap.
- **R9's quarantine-not-drop rule for a policy-violating fact from an
  untrusted branch** — covered: `00f-ground-surfaces.md` names it explicitly
  under **Request or record — classify every write**
  ("quarantine, never 404-and-discard").
- **R17, intercompany elimination** — covered by **The other end, and what
  nets it out**.
- **R23, GenAI must never originate a figure** — covered by **Narrate,
  never post**.
- **R14/R14's Solo-invisibility and upgrade-day rules, and Tranche 9's
  edition test suite** — covered by **Three silhouettes, and the day the
  tier above appears**.
- **S2/S3/S5, sector variance must never become a conditional** — I expected
  this to be missing since none of the six groups mention "sector" at all,
  but domain file 28 covers it head-on: **Five doors, one hallway** (pack vs.
  extension point vs. setting vs. schema field vs. refusal, with a `grep` for
  `BRAND.slug ===`) and **The refusal that isn't graceful** (a disabled
  module's direct importers per `KNOWN_MODULE_COUPLINGS`). No gap here.
- **A possible Br1-vs-R14 contradiction** ("one deployment serves exactly one
  brand" vs. an Organization node holding several `RetailBrand` rows) — I
  traced this and it is not a contradiction: `00a-ground-topology.md` already
  disambiguates that `packages/shared/src/brand.ts` (Br1, the deployment's
  own white-label identity) and `RetailBrand` (`organization.prisma`, a
  client's own retail business unit) are two different things. Not a gap;
  I nearly reported a false one here.
- **The seed-permission-vs-seed-role trap** CLAUDE.md names — already folded
  into `_claude-md-feature-scope.md`'s own scoping-pass paragraph, citing
  `seedPermissions()` vs. `seedRoles()` by name.

## The gap

### 1. No lens classifies a new table's replication direction — every feature that touches more than one node re-litigates R2 from scratch

**Severity: significant, trending blocking once Tranche 3+ (replication) and
Tranche 5+ (chain operations) land.**

**What's missing.** `RETAIL-ERP.md` R2 — "Facts flow up. Policy flows down.
Ledgers merge. Nothing flows sideways" — is stated as a rule that governs
*every* table an Org/Chain-scale feature can add, and `replication.registry.ts`
enforces it mechanically: it throws at boot on a `FACT` registered `DOWN` or a
`POLICY` registered `UP` (`replication.registry.ts:29-33`, quoted verbatim in
`_canonical-decisions.md` Ruling 8 and `_conflicts.md` #8). But the catalogue
only ever asks this question about one entity — `Product`, in file 18's *The
propose-up path that never opens* ("name the field on `Product` that records
which tier owns a given row, and the mechanism… that carries a branch-created
product up"). No lens asks the general form: **for every new table this
feature adds that a Chain or Organization deployment must move across node
boundaries, name its `dataClass` (`FACT`/`POLICY`), its `direction`
(`UP`/`DOWN`), the listener that registers it in `replication.registry.ts`
(`ReplicationRecord`, `replication.prisma`), and — since only
`catalog/product-replication.listener.ts` and
`orders/order-replication.listener.ts` exist today
(`00a-ground-topology.md:27`) — confirm that listener is actually written,
not assumed.**

**What gets built wrong without it.** Two independent failure modes, both
already named in this repo's own documents as things that *will* recur, not
things that merely could:

- **The registry-exception failure**, named verbatim in `_conflicts.md` #8:
  "the shortest path forward is an exception in the registry for this one
  entity. That exception is invisible six months later, and it is the thing
  the next conflict about replication direction will cite as precedent." A
  feature plan that never has to answer the dataClass/direction question
  will hit this the first time an engineer adds a table that needs to travel
  the "wrong" way (a branch-created promotion, a branch-raised purchase
  requisition, a franchisee's compliance document) — and the fix-under-deadline
  is to weaken the registry rather than model the row as a fact-carrying
  proposal the way Ruling 8 already prescribes for `Product`.
- **The silently-dormant failure**, named in `00a-ground-topology.md:54`:
  "Replication is dormant machinery… A lens that assumes 10,000 products or
  100 locations already sync across nodes would be describing unbuilt work."
  A feature plan that names a `dataClass` and a `direction` but never checks
  for a registered listener ships a table that looks correctly classified on
  paper and never actually leaves the node it was written on — a chain
  report at the brand tier that quietly reads zero rows from every branch,
  with nothing in the diff or the review to say so.

Both failures are invisible in review today precisely because no lens forces
the plan to name the registry entry or the listener file the way **Every
column or none** forces a plan to name which `JournalLine` dimension columns
it sets. This is the one place group 5 ("the scale") stops one level short of
where groups 2 and 4 already go: it asks what the *row count* costs at
Organization edition, but not what *crossing a node boundary* costs for a
brand-new table, even though R2's registry is the more immediate way a
Chain-scale feature fails — at boot, not at 100,000 rows.
