# 83 — Entry-level POS: the Solo edition, already this repository's smallest shape

"Entry-level POS deployment" names, without further detail, the smallest
of the three editions `RETAIL-ERP.md`'s own R14 already defines: **Solo**
— one brand, one till, one database, `apps/pos` alone (or `apps/pos` +
`catalog`/`orders`/`finance`'s own basic reports) with everything else
left off the `MODULES` allowlist. This is not a new deployment shape to
design; it is the floor this repository's own module-independence
architecture already guarantees exists, restated here so the promotional
bullet has a citable answer.

## What already makes "entry-level" real, not aspirational

- **`MODULES` allowlist, minimal** — a Solo POS deployment enables
  `catalog`, `orders`, `pos`, and nothing else; every other module
  (`payroll`, `bom`, `hr`, `platform`) is absent, and `CLAUDE.md`'s own
  standing rule guarantees this boots correctly: "every pack must be
  survivably absent."
- **`PlatformPlan.pricingModel`** (doc 50) — an entry-level deployment
  naturally pairs with `FLAT_MONTHLY` (a small fixed monthly fee) or
  `ONE_TIME_LICENSE` with `licenseDeploymentMode = OFFLINE` (doc 48's
  desktop node, a true one-time entry-level purchase with no recurring
  cost at all) — both already real commercial shapes, not invented here.
- **Doc 31's own hardware layer degrades correctly with nothing attached**
  — an entry-level till with no barcode scanner, no receipt printer, no
  cash drawer still sells normally (doc 31's own "absent collaborator"
  answer), so "entry-level" never means "missing core functionality," only
  "fewer optional modules and fewer optional hardware integrations
  enabled."
- **doc 51's own provisioning speed** — an entry-level deployment (whether
  online via doc 39 or offline via doc 48) provisions in the same "minutes,
  nobody on Newax's side touching a keyboard" timeframe doc 51 already
  delivers, since provisioning cost does not scale with how many modules
  are enabled.

## Scope lenses

Not repeated — no new schema, write path, or permission; this document
names an existing combination of already-specified mechanisms
(`MODULES`, doc 48, doc 50, doc 51, doc 31) rather than introducing a new
one.

## Work orders

None. If a real client's "entry-level" package needs a specific named
module bundle, that bundle is a `MODULES` allowlist choice at
provisioning time — a configuration decision, not a code change.

## Acceptance

- No schema or code change — verified by citation to existing mechanisms.
- An entry-level (`catalog` + `orders` + `pos` only) deployment boots and
  sells correctly, per the existing pack-absence guarantee every module
  in this repository already carries.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
