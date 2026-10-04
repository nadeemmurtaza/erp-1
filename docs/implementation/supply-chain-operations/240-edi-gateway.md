# 240 — EDI gateway: partners, interchanges, acknowledgements, canonical documents

> **Status: Planned (2026-10-04). Nothing built.** Architecture:
> [doc 236](./236-supply-chain-operations-architecture.md) §5. Decision record:
> ADR-088 (decision C). Sell-side consumer:
> [doc 241](./241-retailer-vendor-compliance.md). Buy-side consumer:
> `tradingpartners` (this doc §7), which realises
> `18-trading-partner-network.md` WO-18.5.

## Objective

Exchange EDI documents with any trading partner (a large retailer we sell
to, or a supplier we buy from), in whatever standard, version and transport
that partner requires:

- received documents are stored before anything acts on them;
- sent documents are delivered durably, acknowledged and monitored against
  deadlines;
- the rest of the system sees only canonical, retailer-neutral documents.

Supporting a new retailer is configuration plus, at most, one small mapping
extension, never a code branch.

## Existing state (verified, 2026-10-04)

- `18-trading-partner-network.md` WO-18.5 deferred EDI and sketched an
  `EdiTranslator` in front of `tradingpartners` plus a
  `TradingPartner.ediFormat` column. Neither exists.
- `tradingpartners` speaks NEWAX JSON facts (`PartnerFactInbox`, ADR-087).
  It has no envelope, control number, functional acknowledgement or
  transport for AS2 or a VAN.
- Provider extension points with env allowlists already exist and are the
  model here: `PAYMENT_PROVIDERS`, `COURIER_PROVIDERS` (`courier-provider.ts`),
  `AI_PROVIDERS`.
- `core/storage` (`StorageDriver`) stores blobs. `@newax/shared`'s
  `secret-crypto.ts` encrypts stored credentials (AES-256-GCM). The
  platform's JSON body limit is 100 KiB (doc 213).

## 1. What `edi` owns, and what it does not

**Owns:**

- partner identities (interchange and group identifiers, test/production
  indicator);
- transport configuration and encrypted credentials;
- map profiles;
- the interchange record (raw messages, control numbers);
- inbound and outbound documents and their statuses;
- functional acknowledgements (997/999, EDIFACT CONTRL);
- the message monitor.

**Does not own:** what any document _means_ to the business. A purchase
order becomes an order in `vendorcompliance` (sell side). An ASN becomes a
purchase-order fact in `tradingpartners` → `purchasing` (buy side). `edi`
imports no module. Every module talks to it by domain event.

## 2. Canonical documents (`packages/shared/src/edi/canonical.ts`)

Retailer-neutral and standard-neutral TypeScript types plus zod schemas,
shared so no module imports another to read them. Each carries
`schemaVersion`.

| Canonical type                       | X12       | EDIFACT / EANCOM | Key content                                                                                                                                              |
| ------------------------------------ | --------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PurchaseOrder`                      | 850       | ORDERS           | buyer PO number, dates (order, ship-not-before, ship-no-later, must-arrive-by), ship-to party code, lines (buyer item, GTIN, quantity, unit, unit price) |
| `PurchaseOrderAck`                   | 855       | ORDRSP           | per-line accept / reject / change                                                                                                                        |
| `PurchaseOrderChange` / `…ChangeAck` | 860 / 865 | ORDCHG / ORDRSP  | changed lines and dates                                                                                                                                  |
| `ShipNotice`                         | 856       | DESADV           | shipment (carrier, BOL/PRO, ship date) → order → pack (SSCC) → item hierarchy                                                                            |
| `ReceivingAdvice`                    | 861       | RECADV           | what the receiver actually counted (OTIF evidence)                                                                                                       |
| `Invoice`                            | 810       | INVOIC           | invoice number and date, PO reference, lines, allowances and charges, tax, terms                                                                         |
| `Remittance`                         | 820       | REMADV           | payment, per-invoice paid amounts, adjustments with reason codes (deductions)                                                                            |
| `ProductActivity`                    | 852       | SLSRPT / INVRPT  | per location × item × activity (sold, on hand, received) × period                                                                                        |
| `InventoryAdvice`                    | 846       | INVRPT           | our available quantity per item for a partner                                                                                                            |
| `FunctionalAck`                      | 997 / 999 | CONTRL           | accepted / rejected per group and transaction, with errors                                                                                               |

Party codes in canonical documents are the **partner's** codes, never ours.
Translating them to our `Location`, `Contact` or variant is the consumer's
job, through its own mapping tables.

## 3. The extension point

Three interfaces, module-local to `edi` (the `courier-provider.ts` idiom).
The gateway is selected per partner from the `EDI_GATEWAYS` env allowlist,
which is **empty by default**, so the module boots inert.

```ts
/** How bytes reach a partner, and whether someone else does the mapping. */
export interface EdiGateway {
  readonly key: string; // matches EDI_GATEWAYS: e.g. 'x12-van-sftp', 'x12-as2', '<full-service provider key>'
  readonly mapsDocuments: boolean; // true: a full-service provider translates; we exchange canonical JSON with it
  send(
    doc: OutboundEdiEnvelope,
    partner: EdiPartnerConfig,
  ): Promise<EdiTransportReceipt>;
  pull?(partner: EdiPartnerConfig, since: Date): Promise<RawInboundMessage[]>; // mailbox / provider API
  verifyPush?(headers: Record<string, string>, body: Buffer): boolean; // AS2 signature / webhook HMAC
  parsePush?(
    headers: Record<string, string>,
    body: Buffer,
  ): Promise<RawInboundMessage[]>;
}

/** Native translation, used only when gateway.mapsDocuments === false. Pure. */
export interface EdiTranslator {
  toCanonical(raw: Buffer, profile: EdiMapProfileData): TranslationResult; // documents + per-transaction errors
  fromCanonical(
    doc: CanonicalEdiDocument,
    profile: EdiMapProfileData,
    control: ControlNumbers,
  ): Buffer;
}

/** The escape hatch for what a profile's data cannot express. Pure. Keyed by EdiMapProfile.extensionKey. */
export interface EdiMapExtension {
  readonly key: string;
  adjustOutbound?(
    segments: EdiSegment[],
    doc: CanonicalEdiDocument,
    profile: EdiMapProfileData,
  ): EdiSegment[];
  adjustInbound?(
    segments: EdiSegment[],
    profile: EdiMapProfileData,
  ): EdiSegment[];
}
```

**How "Walmart vs Target vs Amazon" stays out of code:**

1. A retailer is an `EdiPartner` row (identifiers, gateway key, transport
   settings) plus one `EdiMapProfile` row per document type and direction.
2. The profile's `rules` hold, as data:
   - standard and version;
   - required, optional and forbidden segments and elements;
   - qualifier choices and constant values;
   - the `HL` hierarchy pattern for an 856;
   - envelope identifiers and delimiters.
3. Every profile carries provenance (`guideTitle`, `guideVersion`,
   `guideRetrievedOn`, `enteredByUserId`, `verifiedByUserId`) and cannot be
   activated without it.
4. Only a guide requirement the rules cannot express gets an
   `EdiMapExtension`: one file, named for the mapping quirk, not the
   retailer (for example `hl-tare-level`), and reusable by any partner whose
   profile names it.
5. With a full-service gateway, the provider holds the retailer maps and
   tracks their changes. NEWAX keeps only the partner row and canonical
   documents.

The ASC X12 and EDIFACT codecs (tokenise and serialise envelopes, segments
and elements; derive delimiters from ISA / UNA) are pure functions in a new
internal package, `packages/edi-codec`, written in-house with **no external
dependency**. Transports are different: SFTP needs an SSH client library and
AS2 needs S/MIME signing and encryption, so each is a dependency decision
under `.claude/rules/dependencies.md`, made only when OD-5 picks it.

## 4. Schema — `apps/api/prisma/schema/edi.prisma` (new)

```prisma
enum EdiStandard  { X12 EDIFACT CANONICAL_JSON }      // CANONICAL_JSON = full-service provider
enum EdiDirection { INBOUND OUTBOUND }
enum EdiOutboundStatus { PENDING SENT TRANSPORT_ACKED FUNCTIONAL_ACKED REJECTED DEAD_LETTER }

model EdiPartner {
  id String @id @default(cuid())
  name String
  ownerNodeId String                 // the ONLY node that may exchange with this partner (control numbers stay single-writer)
  gatewayKey String                  // must be in EDI_GATEWAYS
  standard EdiStandard
  senderQualifier String?; senderId String?; receiverQualifier String?; receiverId String?
  groupSenderId String?; groupReceiverId String?
  usageIndicator String @default("T")  // T(est) | P(roduction) — a partner starts in test
  transportConfig Json               // non-secret settings only (URLs, mailbox paths)
  credentialEncrypted String?        // secret-crypto.ts, never echoed
  functionalAckRequired Boolean @default(true)
  functionalAckDueMinutes Int?       // from the partner's guide; null = unknown (monitor uses §8's 24 h)
  status String @default("PENDING")  // PENDING | ACTIVE | SUSPENDED
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
}
model EdiPartnerChange {             // two-person rule for transport, identifiers and credentials
  id String @id @default(cuid())
  partnerId String; change Json      // credential changes stored encrypted
  proposedByUserId String; approvedByUserId String?; status String @default("PROPOSED")
  createdAt DateTime @default(now()); decidedAt DateTime?
}
model EdiMapProfile {
  id String @id @default(cuid())
  partnerId String; docType String; direction EdiDirection
  version String                     // e.g. "004010", "D96A"
  rules Json; extensionKey String?
  guideTitle String; guideVersion String; guideRetrievedOn DateTime
  enteredByUserId String; verifiedByUserId String?
  status String @default("DRAFT")    // DRAFT | ACTIVE | RETIRED; ACTIVE requires verifiedByUserId ≠ enteredByUserId
  @@index([partnerId, docType, direction, status])
}
model EdiInterchange {
  id String @id @default(cuid())
  partnerId String; direction EdiDirection
  controlNumber String               // ISA13 / UNB 0020
  rawStorageKey String               // StorageDriver; raw bytes never in a DB row
  sizeBytes Int; payloadSha256 String
  status String                      // RECEIVED | PARSED | PARSE_FAILED | SENT | ACKED | REJECTED
  occurredAt DateTime @default(now())
  @@unique([partnerId, direction, controlNumber])
}
model EdiInboundDocument {
  id String @id @default(cuid())
  interchangeId String; partnerId String; docType String
  groupControl String; transactionControl String
  businessRef String?                // PO number, invoice number — for search
  canonical Json?; canonicalStorageKey String?   // inline ≤ 256 KiB, else storage
  status String                      // STORED | PUBLISHED | NEEDS_REVIEW | REJECTED
  errors Json?
  @@unique([interchangeId, groupControl, transactionControl])
  @@index([partnerId, docType, businessRef])
}
model EdiOutboundDocument {
  id String @id @default(cuid())
  partnerId String; docType String
  correlationId String @unique       // supplied by the requesting module — the second-copy guard
  canonical Json?; canonicalStorageKey String?
  interchangeId String?; status EdiOutboundStatus @default(PENDING)
  attempts Int @default(0); nextAttemptAt DateTime?; lastError String?
  dueBy DateTime?                    // from the requester (e.g. an ASN deadline); drives the alert
  createdAt DateTime @default(now()); sentAt DateTime?; ackedAt DateTime?
  @@index([status, nextAttemptAt])
}
model EdiControlNumberCounter { partnerId String; kind String; value BigInt @default(0); @@id([partnerId, kind]) }   // ISA | GS | ST
```

## 5. Inbound: store first, apply second

1. A push (`verifyPush`) or pull (`pull`) yields raw bytes.
2. The raw bytes are stored through `StorageDriver`, and an `EdiInterchange`
   row is inserted. Its unique key makes a retransmission a no-op.
3. The transport is acknowledged (AS2 receipt, HTTP `202`) **before**
   parsing. Acknowledging means "stored", never "accepted".
4. A background job parses in chunks of 5,000 segments, translates per
   transaction set, and writes `EdiInboundDocument` rows.
5. If the partner requires it, a functional acknowledgement goes out as an
   ordinary outbound document.
6. `EdiDocumentReceived { ediPartnerId, docType, inboundDocumentId,
canonical | canonicalStorageKey }` is published.
7. A transaction set that fails validation is `REJECTED`, with errors, and
   produces a negative acknowledgement and a monitor entry. One bad set never
   blocks its siblings.

## 6. Outbound: durable, acknowledged, deadline-aware

1. A consumer publishes `EdiDocumentRequested { correlationId, ediPartnerId,
docType, canonical | canonicalStorageKey, dueBy? }`. `edi` inserts an
   `EdiOutboundDocument`, and `correlationId @unique` makes a redelivered
   event a no-op.
2. `EdiOutboundSender` translates (pure), allocates control numbers in the
   same transaction as the interchange row, stores the raw bytes, and calls
   `gateway.send()`. It then publishes `EdiDocumentSent`, and later
   `EdiDocumentAcknowledged` (transport level, then functional level) or
   `EdiDocumentFailed`.
3. Retries and dead letters follow §8. A dead letter is replayable from the
   monitor. Replay reuses the same `correlationId` and allocates **new**
   control numbers, because a partner rejects a reused one.

## 7. The buy side: `tradingpartners` as a consumer

`TradingPartner` gains `ediPartnerId String?` (bare scalar). This replaces
doc 18's sketched `ediFormat`, because a format alone is not enough.
`tradingpartners` subscribes to `EdiDocumentReceived` for partners it owns:

- **856 / DESADV** → a `PartnerFactInbox` row of type `sale.dispatched`.
  `factId` is a UUID v5 of `(ediPartnerId, interchange control, transaction
control)`, so a retransmission is still a no-op by
  `@@unique([tradingPartnerId, factId])`. `purchasing`'s existing applier
  (WO-213.2) then handles it exactly as it handles a NEWAX fact. Where the
  ASN carries no prices, the applier uses the PO line cost; that change is
  part of WO-240.6.
- **810 / INVOIC** → a fact of type `sale.invoiced` (a new string value, so
  no migration, per `PartnerFactInbox.type`'s own note). `purchasing`
  applies it through `createSupplierBill()`.
- **Outbound 850** to an EDI supplier → `tradingpartners`' existing outbound
  push (doc 18 WO-18.3) publishes `EdiDocumentRequested` instead of an HTTP
  POST when `ediPartnerId` is set.

## 8. Parameters (exact)

| Parameter                      | Value                                                                | Why this number                                                                                                                                                                                                         | Enforced in                        | On failure                                                     |
| ------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Outbound retry delay           | `min(30 s × 2^(n−1), 900 s)`                                         | Doc 213's proven schedule with the cap cut from 3,600 s to 900 s. An ASN is due within hours of dispatch, so an hour between attempts is too coarse; 900 s is at most 4 attempts an hour during an outage.              | `EdiOutboundSender`                | `PENDING` with `nextAttemptAt`                                 |
| Outbound give-up               | **24 h** from creation                                               | A document still undelivered after a day has missed any per-shipment deadline we would expect to see, so a person must act (portal entry or partner contact), not a retry loop                                          | same                               | `DEAD_LETTER`, payload kept, replayable                        |
| Deadline alert                 | **60 min** before `dueBy` while not `TRANSPORT_ACKED`                | Leaves a person time to re-send or use the partner's portal before the deadline                                                                                                                                         | `EdiDeadlineCron`, every 5 min     | Alert to `edi.view` holders scoped to the partner's owner node |
| Functional-ack overdue         | the partner's `functionalAckDueMinutes`; if null, **24 h**           | 24 h is this system's own monitoring threshold, **not** a claim about any partner's rule. A guide's stated window replaces it.                                                                                          | same cron                          | Monitor flag + alert                                           |
| Per-send timeout               | **30 s**                                                             | A multi-MB AS2 POST with a synchronous receipt can legitimately exceed doc 213's 10 s. 30 s still fails fast enough to retry.                                                                                           | gateway call                       | Counts as a failed attempt                                     |
| Inbound rate limit             | **600 requests / 60 s per source IP**                                | Doc 213's figure and reasoning: lets a partner or provider flush a backlog without flooding. EDI pushes are far fewer than that.                                                                                        | `@Throttle` (`core/throttling`)    | `429` + `Retry-After`                                          |
| Raw interchange cap            | **256 MiB**, streamed to storage, never buffered whole               | A large retailer's 852 can be big. For example, 5,000 stores × 500 items × 2 activity codes at 10 pairs per SDQ segment is ~500,000 segments, ~60 MB. 256 MiB leaves 4× headroom. **Re-measure** on the first real 852. | inbound route                      | `413`; the partner or VAN is asked to split                    |
| Parse chunk                    | **5,000 segments per transaction**                                   | Keeps each database transaction to a few hundred milliseconds on the bench fixture, so a large 852 never holds a long transaction                                                                                       | parse job                          | n/a                                                            |
| Canonical inline cap on events | **256 KiB**, else `canonicalStorageKey`                              | Keeps outbox rows small. Typical POs, ASNs and invoices fit well under it.                                                                                                                                              | `edi` and requesters               | Stored by key instead                                          |
| Raw retention                  | **No automatic purge** until the owner sets `edi.raw_retention_days` | Record-retention law differs by jurisdiction, and a guessed number is worse than keeping records (needs verification, doc 236 §10)                                                                                      | retention cron (inert while unset) | n/a                                                            |

## 9. Work orders

Each ships backend, minimum screen, nav entry, permission grants and tests.

- **WO-240.1 — Partners, profiles, the monitor.** Schema, `EdiPartner` with
  the two-person `EdiPartnerChange` flow, `EdiMapProfile` with provenance
  and verify-to-activate, `/admin/edi/partners`, `/admin/edi/monitor`
  (inbound and outbound by status, deadline, partner). Registry
  (`offByDefault`), `MODULE_PACKS`, `EDI_GATEWAYS` (empty) in all four
  `.env*.example`. Permissions `edi.view`, `edi.manage`, `edi.replay`.
- **WO-240.2 — Canonical documents.** `packages/shared/src/edi/canonical.ts`
  types and zod schemas, plus the five `EdiDocument*` domain events.
- **WO-240.3 — Store-first inbound and durable outbound.** Interchange
  storage, the parse job, the outbound sender, retries, dead letters,
  replay, deadline and acknowledgement crons.
- **WO-240.4 — The first gateway.** Whichever OD-5 selects for the first real
  customer, with its dependency questionnaire answered in the PR.
- **WO-240.5 — Native codec.** `packages/edi-codec` (X12 + EDIFACT
  tokenise/serialise, pure, property-tested round-trip),
  `EdiTranslator` over profile rules, `EdiMapExtension` registry,
  997/999/CONTRL generation. Built only if WO-240.4's gateway is native.
- **WO-240.6 — Buy side.** `TradingPartner.ediPartnerId`, the
  `tradingpartners` subscriber (856 → `sale.dispatched`, 810 →
  `sale.invoiced`), the outbound 850, and `purchasing`'s applier accepting a
  price-less dispatch.

## 10. Files likely affected

`edi.prisma` (+ migration); `apps/api/src/modules/system/edi/*`;
`packages/edi-codec` (new, if native); `packages/shared/src/edi/*`;
`domain-events.ts`; `env.validation.ts` (`EDI_GATEWAYS`);
`trading-partners.prisma` (one column) and its module; `purchasing` (the
applier); `permissions.ts`; `apps/web/src/app/admin/edi/*`; `nav-registry.ts`.

## 11. Dependencies reused

`StorageDriver`, `secret-crypto.ts`, `core/throttling`, the outbox, the
`courier-provider.ts` allowlist idiom, `PartnerFactInbox` and `purchasing`'s
applier (ADR-087), `AuditService`,
`PermissionsResolverService.usersWithPermission()`.

## 12. Risks

- **Guide drift.** Retailers revise guides. Mitigation: profiles are
  versioned with provenance; a full-service gateway shifts drift tracking to
  the provider; rejection rates by partner show on the monitor.
- **Implementation guides may be confidential.** They are stored as profile
  data in the customer's own deployment, never in this repository.
- **Test-to-production cutover.** Partners certify in test first.
  `usageIndicator` starts at `T`, and flipping it to `P` is an
  `EdiPartnerChange` needing two people.

## 13. Acceptance criteria

1. With `EDI_GATEWAYS` empty, the module boots, its screens show "no gateway
   configured", and no outbound document leaves.
2. The same interchange received twice produces one `EdiInterchange` and one
   set of documents.
3. A document requested twice with one `correlationId` is sent once. A
   replayed dead letter is sent with new control numbers.
4. A codec round-trip (canonical → X12 → canonical) is lossless over a
   property-test corpus (WO-240.5).
5. A profile cannot be activated without provenance, or by its own author.
6. A partner's transport change takes effect only after a second user
   approves it.
7. With a deliberately failing gateway, a document dead-letters at 24 h, and
   a deadline alert fires 60 min before its `dueBy`.
8. A supplier's 856 creates the same purchase order a NEWAX
   `sale.dispatched` fact would.
9. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
   applies forward on a copy of production data.

## 14. Out of scope

A shared EDI relay on `apps/platform` (ADR-087 Option 3); country
e-invoicing clearance; transport-management documents (204, 210, 214,
753/754 — doc 236 §14); XML standards (cXML, UBL) until a partner names one.
The `EdiTranslator` interface admits them later as another `standard`.

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: inbound arrives → stored → acknowledged
  → parsed → canonical → published → consumed. Outbound requested → sent →
  transport ack → functional ack. Each step is visible on
  `/admin/edi/monitor`.
- The other side: the monitor _is_ the operator twin, with dead letters,
  rejections and approaching deadlines.
- What happens after "done": a rejected acknowledgement re-opens the
  document for correction and replay. A partner's change (860) is its own
  inbound document.
- The integrations a real business needs: a real gateway (WO-240.4, chosen
  by OD-5), never a status enum standing in for transport.
- The policy layer: map profiles with provenance, partner settings, and the
  two-person change flow.

**1. The actor**

- The actor with three tables: a partner is an `EdiPartner` (interchange
  identity). The business identity is elsewhere and linked by bare scalar:
  `RetailerProgram.ediPartnerId` (doc 241) for a retailer,
  `TradingPartner.ediPartnerId` for a supplier.
- The principal with no permission key: an inbound push authenticates by
  `verifyPush()` (AS2 certificate signature, or a provider's webhook HMAC),
  not `PermissionsGuard`. The route is annotated as machine-authenticated for
  `check-route-permissions.mjs`, may only create an `EdiInterchange` for the
  partner the credential names, and reads nothing.
- The grant that ends itself: `EdiPartner.status SUSPENDED` stops both
  directions at once. Credentials have no automatic expiry because partners
  dictate rotation; rotation goes through `EdiPartnerChange`.

**2. The authority**

- Whose rows, and which columns: every row carries `partnerId`. A partner's
  documents are visible to `edi.view` holders on its `ownerNodeId`.
  Credentials are never returned by any endpoint.
- The threshold nobody approves alone: transport, identifier, credential and
  test→production changes need a second `edi.manage` holder. Profile
  activation needs a verifier other than the author.
- The toxic pair: proposing and approving the same partner change.
  `EdiPartnerChangeService.approve()` throws when the actor equals
  `proposedByUserId`. This blocks one person redirecting invoices to an
  endpoint they control.
- Authority and blast radius: the worst single change, pointing a production
  partner at the wrong endpoint, is gated by the two-person rule and
  evidence-class audited, old and new value with secrets redacted.
- Audience is a capability: dead-letter and deadline alerts go to `edi.view`
  holders on the owner node. Zero holders escalates to `edi.manage`. Many
  holders get one digest per 15 minutes, never a ping per document.

**3. The act in the world**

- Request or record: an inbound interchange is a RECORD, always stored even
  when unparseable. An outbound send is a REQUEST that may fail and
  dead-letter.
- The movement with no address: n/a. `edi` moves no stock or cash. Ship-to
  codes stay the partner's, mapped by consumers.
- Four hours down: inbound pushes queue at the partner or VAN, which retry
  by their own schedules, and pulls resume from `since`. Outbound waits in
  `PENDING`, and deadline alerts fire for anything due inside the outage.
  Nothing is lost or doubled, by the interchange and correlation keys.

**4. The money**

- The unwritten posting rule: none. Transport writes no money fact. Postings
  belong to the documents consumers create (supplier bills, deductions).
- Every column or none: n/a, because no `JournalLine` is written.
- The period that already moved: n/a, for the same reason.
- The second legal entity: one `EdiPartner` per (our legal entity, their
  identity) pair. A second brand in another country is another deployment
  (Br1) with its own partners.
- Dry run before live: `toCanonical()` / `fromCanonical()` are pure. Their
  second caller is `POST /admin/edi/profiles/:id/test`, which translates a
  sample without sending.
- Click the number: every monitor count links to its documents, and every
  document to its interchange and raw bytes (permission `edi.manage` to
  download).

**5. The scale**

- Three silhouettes: Solo has the module off. A chain operates partners on
  the brand node (`ownerNodeId`). A group operates org-level partners on the
  org node. No partner is ever operated from two nodes.
- The absent collaborator: `vendorcompliance` or `tradingpartners` off means
  documents are stored and published with no listener, and the monitor
  shows them as "unclaimed". The module never fails boot.
- The second copy of the write: `EdiInterchange` unique `(partnerId,
direction, controlNumber)`, `EdiInboundDocument` unique per transaction
  control, and `EdiOutboundDocument.correlationId @unique`.
- The hundred-thousandth row: a busy vendor sends ~1,000 documents a day,
  about 365,000 a year. The monitor uses `(status, nextAttemptAt)` and
  `(partnerId, docType, businessRef)`, and raw bytes live outside the
  database.
- The adoption test: control numbers come from
  `EdiControlNumberCounter`, per partner, on the single owner node, so two
  nodes can never allocate them.

**6. The afterlife**

- The reversal document: the partner's standard's own cancel/replace (for
  example a replacement ASN with a purpose code), sent as a new outbound
  document. Nothing already sent is edited.
- The undo fan-out:
  - A sent document is deliberately irreversible.
  - A received document's effects are reversed by its consumer's own
    documents (a debit note, a PO change).
- The version stamp: `EdiMapProfile` id and `version` are stamped on every
  interchange, so a disputed document can be re-rendered as it was sent.
- The erasure the ledger cannot obey: canonical documents can hold buyer
  contact names. Raw bytes are a commercial record kept under
  `edi.raw_retention_days`; canonical JSON is pseudonymised on contact
  erasure where it names a person.
- The failure path: parse failures and rejected sets (`REJECTED`, with
  errors) and dead letters (`DEAD_LETTER`, with payload) both appear on
  `/admin/edi/monitor` under `edi.view`. Replay needs `edi.replay`, and is
  safe because inbound keys de-duplicate and outbound replay allocates fresh
  control numbers.
