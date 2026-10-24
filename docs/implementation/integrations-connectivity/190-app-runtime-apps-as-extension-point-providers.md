# 190 — App as provider: an installed app behind `PaymentProvider` or `CourierProvider`, per tenant, through one NEWAX-written remote adapter

> **Status: proposed, not yet built.** No `AppProviderBinding`,
> `RemoteProviderBindingRegistry` or remote adapter exists (grep, `main` at
> `642b2831`). `PaymentProvider` (`modules/sales/payments/payment-provider.ts`) and
> `CourierProvider` (`modules/sales/fulfilment/courier-provider.ts`) are built.
> `FiscalComplianceProvider` is a design (doc 15), not code.
> `VideoConferenceProvider` is proposed by doc 205
> (`tasks-notifications-support/205-self-hosted-video-meetings-livekit.md`,
> ADR-074, written in parallel with this program) as a core seam in
> `core/video/` whose one implementation is NEWAX's own self-hosted LiveKit,
> and it is not built either. §6 says what each needs before an app can
> stand behind it. Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program (ADR-073).

## 1. The shape, and the line it must not cross

Today a provider is a class in this repository, listed in its service's
constructor, switched on by an env allowlist. Examples:
`PaymentsService`'s constructor takes `cod`, `bankTransfer`, `jazzCash`,
`easypaisa`, `giftkarta`, `account` and keeps those that pass
`config.isPaymentProviderEnabled(key)`, and `CourierProvider`'s header
describes the same idiom for `COURIER_PROVIDERS`. That idiom is right for
providers NEWAX writes. It cannot express "tenant 4,812 chose this courier
from the directory yesterday": the choice is per tenant, made at runtime,
and belongs to a vendor NEWAX never wrote a class for.

An app becomes a provider through **one NEWAX-written adapter class per
interface** — `RemoteAppPaymentProvider`, `RemoteAppCourierProvider`. Each
implements the existing interface unchanged and speaks a **published HTTP
protocol** to whichever installed app it is bound to. The adapter is NEWAX's
code, reviewed and committed like any other provider. The app is at the
other end of an HTTPS connection. Nothing from the app runs here (doc 184
§2). The per-tenant choice becomes **data** — an `AppProviderBinding` row
created at install — instead of an env variable naming one fixed vendor.

The built-in providers and their env allowlists are **unchanged**. An
app-backed provider is added beside them, never in place of them.

## 2. Which interface methods may be remote — decided per call site, from the code

A remote call is safe only where the caller can survive it being slow or
down. Both interfaces were read at their call sites:

| Method | Called from | Holds a DB transaction? | Remote-safe? | Adapter behaviour |
|---|---|---|---|---|
| `PaymentProvider.feeFor(amount)` | `PaymentsService.listAvailable()` on **every checkout render**, and at placement | No, but it sits on the checkout's hot path | **No** | Local only: the fee is a declared `{ flatMinor, bps }` in the binding's config (§3), computed in-process. A checkout page never waits on an app. |
| `PaymentProvider.initiate(ctx)` | `PaymentsService.createForOrder(tx, …)` — **inside the order-placement transaction**, before `tx.payment.create()` | **Yes** | **No — and it doesn't need to be** | Prepares a signed redirect locally (§4), with no network call. The interface already requires this shape: the header says JazzCash/Easypaisa "only ever prepare a redirect", and `redeemCode()`'s comment explains why a live external call must never run inside the order transaction. |
| `PaymentProvider.handleCallback(payload)` | `POST /payments/callback/:provider` → `PaymentsService.handleCallback()` | Its own | Inbound — no outbound call | Verifies the app's HMAC over the raw body; `verified: false` on any mismatch, which the service already refuses outright |
| `PaymentProvider.redeemCode()` | post-order gift-card redemption | No | Not offered in protocol v1 | `requiresCode` is never set for an app provider |
| `CourierProvider.createShipment()` | `FulfilmentService.createShipment()` — line 115, **before** its `$transaction` at line 128 | No | **Yes** | HTTPS POST, 10 s timeout, circuit-wrapped |
| `CourierProvider.track()` | `FulfilmentCron`'s polling sweep | No | **Yes** | Same |
| `CourierProvider.cancel()`, `label()` | fulfilment admin actions | No | **Yes** | Same |
| `CourierProvider.verifyWebhook()` | inbound courier push | — | Inbound | HMAC with the installation's secret |

Every outbound call goes through `CircuitBreakerService.execute()` under the
key the service already uses — `payment.${provider.key}`, and
`courier.${provider.key}` for the courier path, added where
`FulfilmentService` calls its provider. Doc 38 already proved per-provider
circuit independence (`payments.service.spec.ts`: "Easypaisa down never
touches COD's own circuit"). Every outbound call also goes through the same
SSRF-safe sender as webhook delivery — doc 188 §4's `https.request` with a
checked `lookup`, no redirects — factored into `core/security/safe-https.ts`
and shared rather than written twice.

## 3. The binding — per installation, per extension point, off until switched on

```prisma
// apps/api/prisma/schema/app-installations.prisma (tenant)

enum RemoteExtensionPoint { PAYMENT  COURIER }
enum AppProviderBindingStatus {
  DISABLED   // installed, not offered — the default
  ENABLED    // offered at checkout / in fulfilment
  RETIRED    // the installation is gone; accepts callbacks for existing references only, until retireGraceUntil (§5)
}

model AppProviderBinding {
  id               String                   @id @default(cuid())
  installationId   String
  extensionPoint   RemoteExtensionPoint
  /// The provider key the rest of the system sees: Payment.provider,
  /// Shipment's courier key, the callback path segment, the circuit key.
  /// Always "app_<listingSlug>" — the prefix can never collide with a
  /// built-in key (cod, bank-transfer, jazzcash, easypaisa, giftkarta,
  /// account, manual), and it stays stable across versions.
  bindingKey       String                   @unique
  protocolVersion  Int
  labelEn          String
  labelUr          String
  descriptionEn    String
  descriptionUr    String
  /// Non-secret: endpoint URLs from the consented manifest; for PAYMENT, the
  /// declared fee { flatMinor, bps } shown at checkout.
  config           Json
  status           AppProviderBindingStatus @default(DISABLED)
  enabledByUserId  String?
  enabledAt        DateTime?
  retiredAt        DateTime?
  retireGraceUntil DateTime?
  createdAt        DateTime                 @default(now())

  installation AppInstallation @relation(fields: [installationId], references: [id])

  @@unique([installationId, extensionPoint])
  @@index([extensionPoint, status])
}
```

**Created `DISABLED` at install** (doc 187 §3). Enabling is its own act,
because installing a courier app is not the same decision as offering it to
every order. `POST /admin/apps/:id/providers/:extensionPoint/enable` and
`/disable` require `@RequirePermission('apps.manage')` and
`@SessionOnly()`. The actor must **also** hold the key that already governs
that domain — `payments.approve` to switch on a payment method (the person
who confirms payments), `fulfilment.manage` to switch on a courier. The
action is evidence-audited as `app.provider_enabled` with the binding key and
the fee shown. **You cannot put a method in front of customers for a domain
you do not operate.**

A provider method that sits at checkout **only while enabled and while its
installation is `ACTIVE`**. Suspension (doc 187 §5.3, doc 191 §3) takes it
off checkout within the registry's cache window, with no deploy.

## 4. The registry, and the two services it plugs into

```ts
// apps/api/src/core/extension-points/remote-provider-binding.registry.ts
export interface RemoteProviderBinding {
  key: string;                               // bindingKey
  extensionPoint: 'PAYMENT' | 'COURIER';
  protocolVersion: number;
  status: 'ENABLED' | 'RETIRED';
  labels: { labelEn: string; labelUr: string; descriptionEn: string; descriptionUr: string };
  config: Record<string, unknown>;           // endpoints, declared fee
  /** Supplied by the source, which alone holds the decrypted secret — the
   *  consuming module signs and verifies without ever touching storage. */
  sign(rawBody: string, now: Date): Record<string, string>;
  verify(headers: Record<string, string>, rawBody: string, now: Date): boolean;
}

export interface RemoteProviderBindingSource {
  bindingsFor(point: 'PAYMENT' | 'COURIER'): Promise<RemoteProviderBinding[]>;
}

@Injectable()
export class RemoteProviderBindingRegistry {
  // register(source); bindingsFor(point) — cached 30 s, cleared on
  // `app_installation.*` and on the binding's own enable/disable event;
  // byKey(point, key) — includes RETIRED bindings (for callbacks), excludes them from listing.
}
```

This is the `TaskSourceRegistry`/`StockIntakeRegistry` shape in
`core/extension-points/`, `@Global`. `app-installations` registers the
source. **`payments` and `fulfilment` never import `app-installations`**,
and `app-installations` never imports them. The adapter classes live in the
modules that own the interfaces, so no DEPTH violation arises from importing
`payment-provider.ts` across modules (`scripts/check-module-boundaries.mjs`):

- `modules/sales/payments/providers/remote-app.provider.ts` —
  `RemoteAppPaymentProvider`, constructed from a `RemoteProviderBinding`.
- `modules/sales/fulfilment/providers/remote-app.provider.ts` —
  `RemoteAppCourierProvider`.

**The one change to each service**, the extension point SDK-CONTRACT step 5
says to file rather than work around. `PaymentsService.listAvailable()` and
`.get(key)` merge the static `providers` Map built in the constructor with
`registry.bindingsFor('PAYMENT')` → `new RemoteAppPaymentProvider(binding)`,
listing only `ENABLED` bindings. `get()` also resolves a `RETIRED` binding,
so a late callback for an existing payment can still be verified (§5).
`FulfilmentService`'s provider map gets the same treatment. With no source
registered (module off), both behave exactly as today.

### 4.1 Payment protocol v1 — NEWAX prepares, the app's licensed rail moves money

1. **`initiate(ctx)`** (in-process, no network): builds
   `{ ref: <PaymentInitiation.reference>, orderNumber, amountMinor, currency,
   customer: { name, phone, email }, returnUrl, callbackUrl:
   "<API_PUBLIC_URL>/payments/callback/<bindingKey>", exp: now + 30 min }`.
   It signs it with the binding's `sign()` — the same HMAC construction as
   webhooks — and returns `{ status: 'PENDING', reference, redirectUrl:
   "<config.checkoutUrl>?p=<base64url body>&sig=<signature>" }`. The
   customer's browser carries the signed request to the app. The customer
   fields are exactly what `PaymentContext` already hands every provider
   (JazzCash receives the same). Doc 187's consent screen names this under
   the provider capability line.
2. **The app** verifies the signature and expiry, takes the payment on its
   own **licensed** rail, and sends the customer back to `returnUrl`.
3. **`POST /payments/callback/<bindingKey>`** — the app posts `{ ref,
   status: PAID|FAILED|CANCELLED, providerRef, failureReason? }`, signed.
   `RemoteAppPaymentProvider.handleCallback()` returns `verified: false` on
   any signature or freshness failure, and `PaymentsService.handleCallback()`
   already refuses those, writing nothing in either direction. The existing
   idempotent status transition makes a repeated callback a no-op.

**Custody.** Money moves between the customer and the app's licensed payment
institution, never through NEWAX. That is doc 175's custody boundary and
doc 155's "never third-party fund custody", held for app providers exactly
as for a built-in PSP. It is why doc 186 §3.3 makes a licensing attestation
a condition of review for any `PAYMENT` app.

**Refunds.** `PaymentProvider` has no refund method: `PaymentsService.refund()`
records a refund; it does not move money. So protocol v1 changes nothing:
the merchant refunds in the app's own dashboard and records it in NEWAX as
they would any refund today. A `refund` operation in protocol v2 needs a
refund method on `PaymentProvider` itself first — a change to the interface,
named rather than smuggled in (§ Out of scope).

### 4.2 Courier protocol v1

`createShipment` POSTs `CreateShipmentInput` (the interface's own shape:
`orderId`, `orderNumber`, `shippingAddress`, `weightGrams`, `packageCount`,
`codAmount`) and expects `CourierShipment`. `track` and `cancel` send the
tracking number. `label` expects PDF or ZPL as base64. `track()`'s
normalised status vocabulary is the interface's own. An app returning
anything else is a protocol error, recorded as a failed call, never passed
through as a new status. Every call is signed with `sign()`, so the app
knows the request is from this tenant. An app may also push updates to
`POST /fulfilment/couriers/<bindingKey>/webhook`, verified by
`verifyWebhook()`. That route is **new**: `CourierProvider.verifyWebhook?`
is declared on the interface today but nothing calls it — no courier
webhook route exists (`docs/index/cross/routes.md`). It is `@Public()` with
its own HMAC verification, the same shape as `POST /payments/callback/:provider`.

## 5. Uninstall with money or parcels in flight — a narrow, time-boxed, verified grace

Uninstall revokes everything at once (doc 191 §2), but a payment already
initiated is a **record** of something that may already have happened. The
customer may have paid at the app's page a minute before the admin pressed
Uninstall. Refusing the app's callback would not undo that payment. It would
make a real payment an unrecorded one, the worst failure this system has
(`RETAIL-ERP.md` R5: a sale that already happened is never rejected).

So the uninstall transaction sets the binding `RETIRED` with
`retireGraceUntil = now + 30 days` instead of deleting it. For those 30 days:

- it is **never** offered at checkout or in fulfilment, and never
  initiates anything;
- `handleCallback()` accepts a verified callback **only** for a `Payment`
  whose `provider = bindingKey` already exists in `PENDING`. It can move that
  payment to `PAID`/`FAILED`/`CANCELLED` and do nothing else;
- `track()` continues for shipments already booked with it, so parcels in
  transit keep reporting.

That is not "disabled but the key still works". The grace holds no
credential to read or write tenant data: the `ApiClient` is revoked and
every token dead. The only thing left is NEWAX's willingness to accept a
signed report about a reference NEWAX itself created. After
`retireGraceUntil`, `AppProviderBindingRetireCron` nulls the secret. A later
callback fails verification, is refused and logged, and the payment stays
`PENDING` in the existing awaiting-approval queue
(`GET /admin/payments/awaiting-approval`, `payments.approve`) for a human to
resolve against the app's statement. Shipments still open go to the
fulfilment queue as "Courier app removed — update manually".

## 6. What makes another interface bindable

Neither `FiscalComplianceProvider` nor `VideoConferenceProvider` can be
bound today, because neither exists in code. `VideoConferenceProvider` is
doc 205's proposed seam, with LiveKit as its one implementation. Once doc 205
is built it meets criterion 1 below, and a Zoom- or Teams-backed app becomes
a plausible directory entry. But its `generateJoinToken()` is specified as
"local signing, no network call", so criterion 2 would have to reclassify
that method — or give it a local-prepare shape — before any remote adapter
could implement it. Doc 36's own rule applies —
"write a typed interface once a real, repeated need exists". An interface
becomes bindable to apps when all five hold:

1. **It exists in code** as a typed interface with at least one built
   implementation. An app must never be the first implementation, or the
   interface ends up shaped by one vendor's API.
2. **Every method is classified per §2** from its real call sites: remote-safe
   (outside any transaction, degradable), or given a local-prepare shape.
3. **A published protocol version** with a conformance suite (doc 186 §3.2)
   runs in review.
4. **A `RemoteExtensionPoint` value and one adapter class** live in the
   owning module, registered through `RemoteProviderBindingRegistry`.
5. **A row in doc 38's degradation matrix** says what still works with the
   app down.

The fiscal case needs more care than most, and doc 181 already points the
way: its "document-shaped `FiscalComplianceProvider` whose UAE ASP
implementation will be its first". Once that interface ships with its first
built implementation, a licensed ASP could publish a directory app behind
it. Submitting a tax document is a legal act, so its protocol must return the
authority's signed acknowledgement and its own retry and idempotency key.
Those are requirements for that future protocol, not built now.

## Scope lenses

Installation lenses are doc 187's and revocation doc 191's. Lines below
cover what binding an app to a provider interface uniquely raises — money
and parcels.

**The five shop-scale lenses.** *Start to finish* — install → enable
(`payments.approve`/`fulfilment.manage`) → offered at checkout or in
fulfilment → signed redirect or booking → signed callback or tracking →
recorded → uninstall → 30-day grace → manual residue. *The other side* —
the awaiting-approval queue and the fulfilment queue receive what grace
could not settle. *After "done"* — refunds (manual in v1, stated),
cancellations (`cancel()`), grace. *Real integration* — a real licensed rail
behind a signed protocol, not a status enum. *Policy* — the licensing
attestation (doc 186 §3.3), the enablement gate (§3), the 30-day grace.
**The actor with three tables** — n/a beyond doc 187: the binding is
configuration of an installation; the app's actor is doc 189's.
**The principal with no permission key** — the app's callback: authenticated
by HMAC over the raw body, and able to move only a `PENDING` payment it was
asked to take. It holds no catalogue key.
**The grant that ends itself** — `retireGraceUntil` ends the last inbound
capability 30 days after uninstall, by cron, with no human remembering;
enablement ends with suspension or uninstall.
**Whose rows, and which columns** — the adapter sends an app exactly
`PaymentContext`/`CreateShipmentInput`, the fields every built-in provider
already receives, and nothing more. The consent screen names them (doc 187
§2 item 5).
**The threshold nobody approves alone** — a `PAYMENT` app's installation needs
the second approver (doc 187 §4.2); enabling it additionally needs
`payments.approve`. Disabling needs one person.
**The toxic pair, caught at grant or at act** — n/a beyond the enablement gate:
no new key is introduced.
**Authority and blast radius** — the worst value is a malicious payment app
enabled at checkout, taking customers' money off-platform. It is contained
by review (licensing), the two-person install, the separate enable act, the
kill switch removing it from checkout within the cache window (doc 191 §3),
and every attempt being a `Payment` row with the binding key.
**Audience is a capability, not an address** — grace-expired payments land in
the existing `payments.approve` queue, and open shipments in the
`fulfilment.manage` queue; no new address.
**Request or record — classify every write** — `initiate()` is part of the
order REQUEST. A verified callback is a RECORD of money that moved, accepted
even during grace, because refusing would lose a fact. An unverified
callback is refused and writes nothing.
**The movement with no address** — n/a: a payment carries no `locationId`
here. The order it belongs to carries its own, set by `orders` unchanged.
Shipments are booked for an order's own fulfilment location.
**Four hours down, the counter stays open** — the courier app down:
`createShipment` fails behind the circuit, the manual courier and any other
bound courier still work, and the order waits in the fulfilment queue. The
payment app down: the method is still listed (the fee is local, so the page
renders) and the redirect fails at the app, so the customer chooses another
method; the circuit then hides it (doc 38's existing "shown as
unavailable" row). A till never uses an app payment method, so no counter
stops.
**The unwritten posting rule** — unchanged: `PaymentSucceeded` posts Dr Cash &
Bank / Cr Accounts Receivable through `posting-rules.subscriber.ts` with
`findPostedEntry(PaymentSucceeded, paymentId)`, the provider appearing only
in the memo. An app-backed PSP settles later, like any PSP, so this program
**inherits, and does not fix,** doc 175 §5.3's "cash in transit is not cash in
the bank" gap for every PSP.
**Every column or none / The period that already moved / The second legal
entity** — n/a: no new posting; the existing rule's answers apply.
**Dry run before live** — the protocol conformance suite (doc 186 §3.2) runs
every method against the app with sandbox data before approval; the
adapter's request-building functions are pure.
**Click the number** — a binding's "12 payments today" drills to `Payment`
rows with `provider = bindingKey`.
**Three silhouettes** — identical per node. A chain enables a courier on
the node that runs fulfilment.
**The absent collaborator** — `app-installations` off: the registry has no
source and both services behave exactly as today. `payments` or
`fulfilment` off: the binding exists and is never read, and the enable action
explains the missing module.
**The second copy of the write** — repeated callbacks are idempotent through
`PaymentsService.handleCallback()`'s existing status transition; a retried
`createShipment` after a timeout sends the same `orderId`, and the protocol
requires the app to treat `orderId` as its idempotency key.
**The hundred-thousandth row** — bindings are a handful per node; the
registry cache keeps them off the checkout's query path.
**The adoption test** — `bindingKey = app_<slug>`: the slug is
platform-generated, a single writer, so two nodes produce the same key for
the same listing, which is correct, and never collide with a different
listing.
**The reversal document, not the reversal flag** — refunds remain
`PaymentsService.refund()`'s existing record (`POST /admin/payments/:paymentId/refund`,
full or partial); protocol v1 adds no money-moving reversal (stated in §4.1).
**The undo fan-out** — uninstall: binding `RETIRED` (automatic), checkout
listing removed (automatic), callbacks for existing references accepted for 30
days (automatic), then the residue goes to human queues (named screens and
permissions above).
**The version stamp** — `protocolVersion` on the binding; a `Payment` row
keeps its `provider` key forever, so which adapter and protocol served it is
recoverable.
**The erasure the ledger cannot obey** — customer name, phone and email sent to
a payment app are outside this database, governed by the directory policy
(doc 186 §4) and the tenant's own agreement with the publisher. They are the
same fields every PSP already receives.
**The failure path, and who is allowed to walk it** — an unverified or
late callback is refused and logged; its payment sits in
`/admin/payments/awaiting-approval` for `payments.approve`. A failed
booking sits in the fulfilment queue for `fulfilment.manage`.

## Work orders

**WO-190.1 — schema**: `RemoteExtensionPoint`, `AppProviderBindingStatus`,
`AppProviderBinding`.
**WO-190.2 — `core/security/safe-https.ts`**: the SSRF-safe sender shared
with doc 188.
**WO-190.3 — `RemoteProviderBindingRegistry`** and the `app-installations`
source (signing via the installation's secret; cache and invalidation).
**WO-190.4 — `RemoteAppPaymentProvider`** + the `PaymentsService` merge in
`listAvailable()`/`get()`; protocol v1; retired-binding callback handling.
**WO-190.5 — `RemoteAppCourierProvider`** + the `FulfilmentService` merge;
the `courier.<key>` circuit wrap; protocol v1; the courier webhook route.
**WO-190.6 — enable/disable** routes, the domain-key gate, evidence audit,
the provider switches on the installation screen.
**WO-190.7 — `AppProviderBindingRetireCron`** and the manual-residue hand-off
to the payments and fulfilment queues.
**WO-190.8 — conformance suites** for both protocols (used by doc 186
§3.2) and the protocol pages in `/ui/developers`.

## Acceptance

- Rendering checkout with an enabled app payment method makes **zero**
  network calls to the app.
- `initiate()` for an app provider makes no network call inside the order
  transaction (asserted by a spec that fails on any outbound request).
- An app courier down leaves `manual` and every other courier working, and
  its own circuit opens without affecting theirs.
- A callback with a bad signature changes nothing; a verified one for an
  existing `PENDING` payment during grace settles it; one after grace is
  refused, and the payment remains in the awaiting-approval queue.
- A suspended installation's payment method disappears from checkout within
  the cache window, with no deploy.
- With `app-installations` off, `payments` and `fulfilment` specs pass
  unchanged.

## Out of scope

Refunds through the app (protocol v2, after `PaymentProvider` gains a refund
method). App-backed `AiProvider`, `StorageDriver`, `NotificationChannel`,
`IdentityProvider` or `VectorStore` — each would route tenant data wholesale
through a third party (every prompt, every file, every message or every
sign-in), a materially different consent needing its own decision. App-backed
till tenders at POS — the offline till (R5) cannot depend on a remote app.
