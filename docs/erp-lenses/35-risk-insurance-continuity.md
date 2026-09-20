# 35. Risk, insurance and business continuity

At shop scale a loss is a bad afternoon: count the damage, write it off,
move on. At corporate scale the same event is a claim someone must
substantiate to an insurer, a risk someone owns and must re-review, and a
branch that must either resume trading or be formally routed around. A
narrow build treats these as one `WRITE_OFF` movement and stops; the
complete capability treats the movement as the first row in a record that
outlives it.

## Lens: The insured value nobody can total

**Question:** For a single `Location`, what is today's query — name the
tables and the join — that returns the value of stock at risk there, and
where would a per-location valuation basis (replacement cost vs retail vs
landed cost) live if it must differ from the costing figure used for COGS?
**Why:** `ProductVariant.costPrice` is one global weighted average per
variant, updated only by `purchasing.service.ts` on goods receipt, with no
location dimension (ground truth). `VariantLocationStock` (`inventory.prisma:156`,
`@@id([variantId, locationId])`) gives quantity per location. `Location`
(`inventory.prisma:76-113`) has no value, insured-value or valuation-basis
field. There is no `CostCentre` model. So "value at risk here" today can
only mean quantity times the one global average, everywhere.
**Worked example:** Narrow slice: a "stock at risk" report summing
`VariantLocationStock.quantity * ProductVariant.costPrice` per `locationId`
and calling it insured value. Complete capability: a valuation basis the
risk team can name (cost, retail, replacement), a point-in-time snapshot
exportable to a broker, and an explicit statement of which basis a given
figure uses.
**Done test:** `grep -rn "insuredValue\|replacementValue\|valuationBasis" apps/api/prisma/schema` —
today returns nothing. The PR either adds the field/model or the PR body
names, in writing, that the report is cost-basis-only and why.
**Breaks without:** Two locations holding identical unit counts of cheap
and expensive stock report identical "value at risk" — a location holding
10,000 embroidered units and one holding 10,000 plain units insure
identically, so premium allocation and under-insurance risk across 100+
locations is invisible to the person who has to sign the policy.

## Lens: The claim's evidence pack, not just the claim

**Question:** When a `DAMAGE`/`WRITE_OFF` `StockMovement` or an oversell
`StockVariance` becomes an insurance or shrinkage claim, what table holds
the claim — insurer name, claim reference, amount claimed, amount
recovered — and how does today's code attach a photo or a police report
reference to it?
**Why:** `StockVariance` (`inventory.prisma:127-150`) carries only
`resolutionNote String?`, `resolvedByUserId`, `resolvedAt` — resolution is
an acknowledgement, not a claim (`stock-variance.service.ts.resolve()`
moves no stock and reverses no journal, per ground truth). `AuditLog.data`
(`core.prisma:220-235`) is a free-text `Json?` written best-effort, failures
swallowed. `grep` for `Attachment|model Document|fileUrl|s3Key` across
`apps/api/prisma/schema` returns nothing in the 115-model schema — there is
no file or evidence model anywhere.
**Worked example:** Narrow slice: resolve a `StockVariance` by typing a
one-line `resolutionNote` and flipping status to `RESOLVED`. Complete
capability: a `Claim` record linking the source `StockVariance`/
`StockMovement` rows, an insurer reference, claimed-vs-recovered amounts,
and an evidence list, so a `WRITE_OFF` from six months ago still points
forward to what an adjuster asked for.
**Done test:** `grep -rn "model Claim\|model Attachment" apps/api/prisma/schema`
— PR either adds the model or its body states the deferral and names the
doc that owns it. A `StockVariance` row must be linkable to at least a
claim-reference string.
**Breaks without:** A branch fire destroys stock; the only system record is
a `WRITE_OFF` movement and maybe a resolution note — no claim number, no
recovered-amount field, no evidence trail — so the insurer payout and the
books never reconcile, and internal audit has nothing to produce for the
claim file.

## Lens: The branch that cannot trade tomorrow

**Question:** When a `Location` must stop trading from tomorrow (fire,
flood, forced closure), which field gets flipped, and does that single
change stop `InventoryService.defaultLocationId()` from routing a receipt
there, stop `TransfersService` from dispatching a new transfer to it, and
stop its `PosTerminal` rows from opening a shift?
**Why:** `Location.isActive` exists (`inventory.prisma:101`) but
`InventoryService.defaultLocationId()` resolves by `isDefault` only (ground
truth: `inventory.service.ts:166`), and eight call sites depend on it with
no caller-supplied `locationId`. `NodeStatus` has `ACTIVE|SUSPENDED`
(`organization.prisma:127-130`) but `Node` carries no `locationId` link.
`PosTerminal.status` (`pos.prisma:27-41`) is its own independent enum, with
no relation back to `Location.isActive`.
**Worked example:** Narrow slice: set `Location.isActive = false` and
consider the branch closed. Complete capability: one action that also
blocks new `PosShift` opens at that location's terminals, refuses new
`StockTransfer` dispatch to or from it, reroutes `defaultLocationId()`
fallbacks elsewhere, and flags in-flight orders/transfers still pointing at
it.
**Done test:** PR names every write path gated on `Location.isActive`
(`grep -rn "isActive" apps/api/src/modules/{inventory,pos,transfers}`) and
shows `PosTerminal` and `TransfersService` both refusing against an
inactive location. Today that grep finds the field with no consuming
guard in those services.
**Breaks without:** The branch burns down at 6pm; nothing stops tomorrow's
goods receipt or a dispatched transfer landing there, and a terminal opens
a shift because `PosTerminalStatus` never read `Location.isActive` — the
loss the business needed contained becomes a second loss on top of the
fire.

## Lens: The risk register with no register

**Question:** Where does a risk entry live — one row naming the risk, its
owner, a likelihood/impact rating, the `Location` or `RetailBrand` it
threatens, and the date it is next due for review — and what query lists
every risk overdue for review today?
**Why:** `grep -rn "model Risk" apps/api/prisma/schema` returns nothing
across all 115 models. No model in this repo has an owner-plus-review-date
shape — `RoleGrant`, `UserRoleAssignment`, `UserPermission` and
`AdminScope` (`organization.prisma:106-120`) each carry only `createdAt`
and nothing expires or re-reviews (ground truth). `AdminScope` is the
closest owner-shaped row but it grants access; it does not register a risk.
This differs from lens 10 ("name the owner, name the reader it refuses"),
which asks for a scope column on a business object — a risk register is a
governance object with its own review cadence, not a filter on existing
rows.
**Worked example:** Narrow slice: track risks in a spreadsheet because "no
model exists." Complete capability: a `Risk` model (title, `ownerId`,
likelihood, impact, `linkedLocationId`/`retailBrandId`, `nextReviewDate`,
status), a `risk.manage` permission key, and a list sorted by overdue
review date.
**Done test:** `grep -rn "model Risk" apps/api/prisma/schema` — PR adds it
plus an "overdue for review" query, or the PR body states in one line that
this is out of scope and names the doc it defers to.
**Breaks without:** At 100+ locations, risks live in someone's inbox with
no owner of record and no forcing function; the fire-safety risk flagged on
a branch is never re-reviewed after the manager who flagged it leaves, and
nobody can produce the overdue list when an external auditor asks for the
register.

## Not modelled yet

- No insurance-claim or file/evidence-attachment model anywhere in the
  115-model schema (`Attachment`, `Document`, `fileUrl`, `s3Key` all grep
  to nothing).
- No per-location or per-policy valuation field distinct from the single
  global weighted-average `ProductVariant.costPrice`.
- No `Risk`/`RiskRegister` model, and no owner-plus-review-date shape on
  any existing grant or scope table.
- No single switch that stops a `Location` from trading across inventory,
  transfers and POS at once — `Location.isActive`, `NodeStatus` and
  `PosTerminalStatus` are three unlinked flags today.
- No business-interruption or continuity-plan model (alternate location,
  failover roster, resumption target) anywhere in the schema.
