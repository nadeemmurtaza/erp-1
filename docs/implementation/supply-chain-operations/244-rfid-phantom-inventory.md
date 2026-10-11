# 244 — Phantom inventory: suspects from sales velocity (no hardware) and from RFID counts

> **Status: Planned (2026-10-04). Nothing built. Lower priority** in the
> owner's mandate. Architecture: [doc 236](./236-supply-chain-operations-architecture.md).
> Decision record: ADR-088.

## Objective

Find stock the system believes is on the shelf but is not ("phantom
inventory"), before it silently suppresses reorders and online sales:

- first from sales behaviour alone, with no hardware;
- then, where items carry RFID tags, from tag counts.

A suspect is evidence, never a correction. It schedules a count, and only a
count changes stock.

## Existing state (verified, 2026-10-04)

- `inventory` already runs the review-queue idiom this copies:
  - `MarkdownSuggestion` (reasoning trail, PENDING → CREATED / DISMISSED);
  - `VariantForecast` (a cache computed by `InventoryCron`);
  - `StockVariance` (an exception queue).
- `SpotCheck` / `SpotCheckLine` (doc 156) already schedule small counts at a
  location, with expected values frozen, completable on POS or mobile.
- `VariantSalesStat` is **per variant, not per location** (`units30`,
  `units90`, `lastSoldAt`), so per-location velocity must come from
  `StockMovement`, which carries `locationId` and is indexed on
  `(reason, createdAt)` and `(locationId)`.
- `SerializedUnit` exists for one-identity-per-unit stock.
- `core/extension-points/camera-people-count.registry.ts` is a precedent for
  a hardware-evidence registry.
- No RFID, EPC or reader concept exists.

## 1. Design

**Velocity suspects (`inventory`, WO-244.1).** The nightly `InventoryCron`
computes, per `(variant, promisable STORE location)`:

- `units90` (from `SALE` and `POS_SALE` `StockMovement`s at that location);
- `daysSinceLastSale`;
- current `VariantLocationStock`.

`detectPhantomCandidates()` (pure) raises a suspect when **all** of these
hold:

- stock > 0;
- `units90 ≥ 3` (enough history to have a rate);
- `daysSinceLastSale ≥ max(14, 3 × 90 / units90)`.

The statistics: under a Poisson sales process with mean inter-sale interval
`T`, the chance a genuinely stocked item sells nothing for `3T` is `e⁻³ ≈
5%`. Three intervals therefore keeps false alarms near one in twenty per
check. The 14-day floor stops fast movers from flagging after one quiet
weekend.

**RFID suspects (`rfid` module, WO-244.2–244.4).**

- **Reading.** A reader (fixed, or a handheld session) authenticates by
  device credential and uploads distinct EPCs per count session. Raw reads
  are never stored: only distinct EPCs per session, then counts.
- **Decoding.** `decodeSgtin96()` (pure, `packages/shared`) maps an EPC to
  GTIN + serial, and the GTIN maps to a variant through
  `ProductVariant.barcode`. It is tested against GS1's published Tag Data
  Standard examples, not written from memory alone.
- **Counting.** At session close, `RfidObservedCount` per variant is compared
  with system stock only for zones the session declared a **full sweep**,
  and only using that zone's calibrated `expectedReadRateBps`. A suspect is
  raised when
  `observed < floor(system × readRate / 10,000) − 2`.
- **Publishing.** `RfidCountObserved` is published, and `inventory` raises
  or updates the suspect with RFID evidence.
- **Calibration** of the read rate per zone is a customer measurement
  (counting a known population). The module ships no default read rate,
  and a zone with none never raises a suspect.

**Resolution (both sources).** A suspect is `PENDING`. "Schedule count"
creates a `SpotCheck` (existing) for that location with the suspect
variants. The completed count posts its variance through the existing
`COUNT` path, and the suspect becomes `CONFIRMED` (variance found) or
`DISMISSED` (stock was there). Nothing in this design adjusts stock from
evidence.

## 2. Schema

**`inventory.prisma` (additive):**

```prisma
model PhantomStockSuspect {
  id String @id @default(cuid())
  variantId String; locationId String          // scope columns, NOT NULL
  systemQty Int; evidence String                // VELOCITY | RFID
  evidenceData Json                             // units90, daysSinceLastSale | sessionId, observed, readRateBps
  status String @default("PENDING")             // PENDING | COUNT_SCHEDULED | CONFIRMED | DISMISSED
  spotCheckId String?; createdAt DateTime @default(now()); resolvedAt DateTime?
  @@index([locationId, status])
  // partial unique index on (variantId, locationId) WHERE status IN ('PENDING','COUNT_SCHEDULED') — migration only
}
```

**`rfid.prisma` (new):**

```prisma
model RfidZone { id String @id @default(cuid()); locationId String; code String; kind String; expectedReadRateBps Int?; @@unique([locationId, code]) }
model RfidReader { id String @id @default(cuid()); locationId String; zoneId String?; driverKey String; label String; credentialHash String @unique; status String @default("ACTIVE"); credentialExpiresAt DateTime? }
model RfidCountSession { id String @id @default(cuid()); readerId String; locationId String; zoneId String?; fullSweep Boolean; clientSessionId String @unique; startedAt DateTime; closedAt DateTime?; status String }
model RfidSessionEpc { sessionId String; epc String; @@id([sessionId, epc]) }      // distinct EPCs only; purged after count (§3)
model RfidObservedCount { id String @id @default(cuid()); sessionId String; variantId String; observedQty Int; systemQtyAtClose Int; @@unique([sessionId, variantId]) }
```

## 3. Parameters (exact)

| Parameter              | Value                                                                   | Why this number                                                                                                                                   | Enforced in                     | On failure                                    |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| Velocity rule          | stock > 0, `units90 ≥ 3`, `daysSinceLastSale ≥ max(14, 3 × 90/units90)` | e⁻³ ≈ 5% false-alarm chance under Poisson (§1). The 14-day floor guards against weekends and short promotions.                                    | `detectPhantomCandidates()`     | n/a                                           |
| RFID upload batch      | **2,500 EPCs per request**                                              | A 24-hex-character EPC with JSON overhead is ~30 bytes, so 2,500 is ~75 KiB, inside the platform's existing 100 KiB JSON body limit               | ingestion DTO                   | `413`; the client splits                      |
| RFID device rate limit | **60 requests / 60 s per device credential**                            | Up to 150,000 EPCs a minute per device, more than any handheld reads, so it never limits a real sweep, while bounding a stolen credential's flood | `@Throttle` keyed on the device | `429` + `Retry-After`                         |
| Session EPC retention  | **7 days** after the session's count is computed                        | Long enough to re-run a disputed count. EPCs are serial-level data with no use after counting.                                                    | daily purge cron                | n/a                                           |
| RFID suspect margin    | `observed < floor(system × readRateBps / 10,000) − 2`                   | Uses the zone's own measured read rate, never an assumed one. The 2-unit slack absorbs single misreads on small quantities.                       | `rfid` comparison               | No suspect when `expectedReadRateBps` is null |

## 4. Work orders

- **WO-244.1 — Velocity suspects (no hardware).** `PhantomStockSuspect`,
  `detectPhantomCandidates()` (pure, table-tested including the 5% bound) in
  `InventoryCron`, and `/admin/inventory/phantom-suspects` with "schedule
  count" creating a `SpotCheck`. Resolution from the spot check's
  completion. Reuses `inventory.manage` (no new key, because resolving is a
  count). Needs WO-236.1 only for event-driven refresh; works nightly without
  it.
- **WO-244.2 — RFID readers and zones.** `rfid` module, schema, registry
  (`offByDefault`), `MODULE_PACKS`, `/admin/rfid/zones` (with the calibration
  workflow) and `/readers` (credential issued once, hashed, rotatable).
  `RFID_DRIVERS` allowlist (default `http-batch`). Permissions `rfid.view`,
  `rfid.manage`.
- **WO-244.3 — Count sessions and decode.** Machine-authenticated ingestion,
  `decodeSgtin96()` with GS1 test vectors, session close, observed counts,
  and `RfidCountObserved` → `inventory` suspects.
- **WO-244.4 — Vendor reader drivers.** Only when a real customer names a
  reader. Each is an `RfidReaderDriver` behind a local bridge, the
  hardware-as-extension-point pattern of
  `pos-hardware/31-sector-pos-hardware-integration.md` (ADR-067).

## 5. Acceptance criteria

1. With `rfid` off, velocity suspects still work. With both off, nothing
   changes.
2. A variant/location meeting the velocity rule produces exactly one open
   suspect, and a re-run does not duplicate it (partial unique index).
3. No suspect ever changes `VariantLocationStock`. Only a completed
   `SpotCheck` does, through the existing path.
4. A zone without `expectedReadRateBps` never raises an RFID suspect.
5. A redelivered upload batch (same `clientSessionId` and EPCs) changes no
   count.
6. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migrations apply
   forward on a copy of production data.

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: evidence (velocity or RFID) → suspect →
  scheduled `SpotCheck` → count → variance through the existing path →
  suspect resolved.
- The other side: the suspect queue per location, and the confirmed-versus-
  dismissed rate per evidence type (is the rule earning its keep?).
- What happens after "done": a confirmed phantom is a counted variance. Its
  reorder effect follows automatically from corrected stock.
- The integrations a real business needs: a real RFID reader only through a
  driver for a named device (WO-244.4). The handheld path needs only the
  existing `apps/mobile`.
- The policy layer: the velocity rule (Settings for its three numbers,
  audited) and per-zone read-rate calibration.

**1. The actor**

- The actor with three tables: staff are `User`. Readers are `RfidReader`
  rows with a credential, which makes them device principals.
- The principal with no permission key: a reader authenticates by
  `credentialHash` (like `PosTerminal` device credentials), not
  `PermissionsGuard`. It may only append sessions for its own `locationId`
  and reads nothing. The route is annotated as machine-authenticated.
- The grant that ends itself: `RfidReader.credentialExpiresAt` (set at issue
  from `Setting` `rfid.credential_ttl_days`; unset = no expiry, shown on the
  reader list) and `status SUSPENDED`.

**2. The authority**

- Whose rows, and which columns: suspects and sessions name `locationId`, and
  lists are scoped by location (WO-236.4). Suspects show quantities, never
  cost.
- The threshold nobody approves alone: none needed. A suspect commits
  nothing, and the count it schedules is approved through `SpotCheck`'s and
  `COUNT`'s existing paths.
- The toxic pair: dismissing a suspect and performing its count.
  `PhantomStockSuspect` can only be dismissed through a completed
  `SpotCheck`. A direct dismiss without a count is refused, so no single act
  can bury evidence.
- Authority and blast radius: changing a zone's read rate (`rfid.manage`,
  evidence-class audit old/new). The worst value, 10,000 bps on a zone that
  reads 80%, floods suspects, and the confirmed rate on the queue exposes it
  within a week.
- Audience is a capability: a daily digest per location to
  `inventory.manage` holders scoped there. Zero holders escalates to
  brand-level `inventory.manage`. Never one ping per suspect.

**3. The act in the world**

- Request or record: an RFID session is a RECORD (it happened). A suspect is a
  REQUEST for a count. Only the count is the record that moves stock.
- The movement with no address: every session and suspect names its
  `locationId`. Readers are bound to one location at issue.
- Four hours down: handhelds keep their session and upload on reconnect
  (`clientSessionId` makes it idempotent). The nightly velocity job simply
  runs on the next night.

**4. The money**

- The unwritten posting rule: none here. The count variance posts (or does
  not, today) through `COUNT`'s existing path, a pre-existing gap named in
  doc 236 §2.
- Every column or none: n/a, because no `JournalLine` is written.
- The period that already moved: n/a, for the same reason.
- The second legal entity: n/a. No tax document and no legal series.
- Dry run before live: `detectPhantomCandidates()` is pure. Its second
  caller is a "preview on last 90 days" button showing how many suspects a
  rule change would raise.
- Click the number: each suspect links to its evidence (movements counted,
  or session and EPC counts), and each resolution to its `SpotCheck`.

**5. The scale**

- Three silhouettes: a Solo shop gets velocity suspects for its one location,
  a chain per store, a group per brand. Never at the ORG tier, where the
  intelligence layer reads, not the floor.
- The absent collaborator: `rfid` off means velocity only. `pos` off means
  `SALE` movements still feed velocity.
- The second copy of the write: the partial unique index on open suspects,
  `RfidCountSession.clientSessionId @unique`, and `RfidSessionEpc`'s
  composite key.
- The hundred-thousandth row: the velocity job groups `StockMovement` by
  `(variantId, locationId)` over 90 days in one nightly batch, never on a
  page load. Session EPCs are purged after 7 days.
- The adoption test: no human-readable number is minted. Session ids are
  client UUIDs.

**6. The afterlife**

- The reversal document: n/a. A suspect is never reversed, only resolved, and
  the count's variance is reversed through `COUNT`'s own correction path.
- The undo fan-out: scheduling a count is undone by cancelling the
  `SpotCheck` (existing), after which the suspect returns to PENDING.
- The version stamp: `evidenceData` stores the rule parameters in force when
  the suspect was raised.
- The erasure the ledger cannot obey: EPCs can identify a serialised item a
  customer later bought. They are purged after 7 days, and observed counts
  hold no EPC.
- The failure path: an upload that fails validation is refused with `400`
  and logged with the reader id. A session that cannot be decoded (unknown
  GTIN) lists its unmapped EPC count on the session screen under `rfid.view`.
