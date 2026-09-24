# 159 — Calls, SMS, WhatsApp, business email: one provider-swap pattern, extended to the one channel it doesn't cover yet

Three of the five channels named in this request are **already answered**
by mechanisms this repository has built or specified — cited, not
rebuilt. The fourth — voice calling, through a VoIP/SIP/call-service
provider — has no extension point anywhere in this codebase, confirmed by
grep. This document closes that one real gap, using the identical
provider-swap pattern (`PaymentProvider`, `FiscalComplianceProvider`,
`NotificationChannel`) every other communications channel in this
repository already follows, so "maximum flexibility" means what it always
means here: one interface, any number of vendor implementations, zero
core code touched to add or replace one.

**On "SSP"**: read as a call/SIP-service-provider family generically —
SIP trunk vendors, hosted cloud-PBX platforms, and call-center API
providers (Twilio Voice, Vonage, Plivo, Exotel, Amazon Connect, a
self-hosted Asterisk/FreePBX trunk, or any other) all speak a request/
webhook shape this document's interface is built to fit; naming a specific
vendor is a config change (§4), never a rewrite of this document's design.

## What's already built or specified — cited, not duplicated

- **SMS and WhatsApp** — doc 33's own `NotificationChannel` implementations
  are fully specified (a Twilio-shaped SMS provider, a WhatsApp Business
  API provider), each swappable via the `NOTIFICATION_CHANNELS` allowlist;
  not yet built only because doc 33/101 both name the same real blocker —
  no gateway account has been chosen yet, not an architecture gap.
- **Business email** — confirmed by reading `email.channel.ts`: it already
  speaks plain SMTP (`SMTP_HOST`/`PORT`/`USER`/`PASSWORD`), which is
  provider-agnostic by construction — a self-hosted Coolify mailbox (doc
  13), SendGrid, Amazon SES, Postmark, Google Workspace or Microsoft 365
  all work today by changing four env values, no code change. `doc
  13-email-service-plan.md` describes the *recommended* self-hosted
  deployment, never the *only* one the channel accepts.
- **Voice calling** — confirmed by grep across `apps/api/src`, `apps/web/src`
  and every implementation doc: no `TelephonyProvider`, `CallLog`, SIP, IVR,
  or CDR (call detail record) concept exists anywhere. This is the real,
  new work.

## 1. `TelephonyProvider` — the same shape as every other extension point in this repository

```ts
// core/telephony/telephony-provider.ts
export interface CallInitiation {
  /** The provider's own call identifier — never generated here. */
  providerCallId: string;
  status: 'INITIATED' | 'RINGING' | 'FAILED';
}

export interface CallEvent {
  providerCallId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromNumber: string;
  toNumber: string;
  status: 'RINGING' | 'ANSWERED' | 'COMPLETED' | 'NO_ANSWER' | 'BUSY' | 'FAILED';
  durationSeconds?: number;
  /** Signed URL or provider reference — never fetched inline; §3 pulls it into our own storage. */
  recordingUrl?: string | null;
  /**
   * False when the callback did not prove it came from the provider — the
   * identical discipline PaymentCallbackResult.verified already enforces
   * for a payment gateway's own webhook (payment-provider.ts). An unsigned
   * call event is refused outright, never applied in either direction.
   */
  verified: boolean;
}

export interface TelephonyProvider {
  /** Stable key, matching the TELEPHONY_PROVIDERS allowlist. */
  readonly key: string;
  /** Click-to-call: bridge an agent's own line to a customer's number. */
  initiateCall(input: { fromUserId: string; toNumber: string; purpose?: string }): Promise<CallInitiation>;
  /** Parses and verifies one inbound webhook delivery from this provider. */
  parseWebhook(rawBody: Buffer, signatureHeader: string | undefined): CallEvent | null;
}
```

Adding a vendor — Twilio Voice, Exotel, a raw SIP trunk fronted by a small
adapter, anything else — is one new class implementing this interface plus
an entry in `TELEPHONY_PROVIDERS`. Nothing else in the codebase changes,
identical to how `PaymentProvider`/`NotificationChannel` already work.

## 2. `CallLog` — a record, never a request, the moment the call is over

```prisma
// core.prisma — additive
enum CallDirection { INBOUND OUTBOUND }
enum CallStatus    { RINGING ANSWERED COMPLETED NO_ANSWER BUSY FAILED }

model CallLog {
  id                   String        @id @default(cuid())
  organizationId       String
  providerKey          String
  providerCallId       String
  direction            CallDirection
  fromNumber           String
  toNumber             String
  status               CallStatus
  durationSeconds      Int?
  recordingStorageKey  String?       // StorageService's own key, §3 — never the provider's own URL, which can expire
  initiatedByUserId    String?       // set for OUTBOUND click-to-call, null for INBOUND
  contactId            String?       // doc 06/64's own Contact, when the number resolves to one
  ticketId             String?       // doc 64's SupportTicket - a call can open or attach to one
  startedAt            DateTime
  endedAt              DateTime?

  @@unique([providerKey, providerCallId])
  @@index([contactId, startedAt])
  @@index([ticketId])
}
```

`initiateCall()` is a REQUEST (refusable — no provider configured, the
calling user has no extension, the number is malformed). The resulting
`CallLog` row, once a provider webhook reports the call actually happened,
is a RECORD in the identical sense doc 22's attendance events already are:
"somebody's phone rang at 14:02, the system does not get a vote." A
webhook that fails `verified` is refused outright and writes nothing — the
same standing counter-risk doc 155's payment callback already names and
closes.

## 3. Recording — reused storage, never a provider-hosted link left as the only copy

```ts
async captureRecording(call: CallLog, providerUrl: string): Promise<void> {
  const audio = await this.telephony.fetchRecording(providerUrl); // provider-specific, behind the same interface
  const stored = await this.storage.putDocument({
    folder: 'call-recordings',
    filename: `${call.id}.mp3`,
    contentType: 'audio/mpeg',
    body: audio,
  });
  await this.prisma.callLog.update({ where: { id: call.id }, data: { recordingStorageKey: stored.key } });
}
```

Reuses `StorageService.putDocument()` unchanged — the identical mechanism
doc 04's receipt uploads and doc 28's document vault already use. A
provider's own recording URL is treated as temporary and pulled into our
storage immediately, never linked to directly, so a call recording
outlives whatever retention window the vendor applies to its own copy.

## 4. Configuration — the same allowlist shape `PAYMENT_PROVIDERS`/`NOTIFICATION_CHANNELS` already use

```ts
// env.validation.ts — additive
TELEPHONY_PROVIDERS: csv(''),   // off by default, e.g. "twilio_voice,exotel"
```

Off by default: booting with no telephony provider configured is a fully
supported, unremarkable state — click-to-call buttons simply don't render
(§6's own "absent collaborator" answer), never a broken button or a
silent no-op.

## 5. Where a call attaches to what already exists — never a second contact record, never a second ticket system

- **Who's calling**: resolved against `Contact` (doc 06/64) by phone
  number, the same actor table every customer-facing document in this set
  already uses — never a new `Caller` table.
- **Support**: an inbound call can open a new `SupportTicket` or attach to
  an existing open one for that `Contact`, appearing in doc 64's own queue
  exactly like an email or chat-originated ticket — a call is one more
  entry channel, not a parallel ticket system.
- **Sales**: click-to-call from an `Order`'s own detail screen (doc 01)
  dials the customer directly, logging the call against that order's
  `contactId` for a complete contact-history timeline.

## Scope lenses

**The actor with three tables** — the party on the other end of a call is
always doc 06/64's own `Contact`; the party placing an outbound call is
always an existing `User`. No new actor table.
**The principal with no permission key** — n/a: `TelephonyProvider` acts
on behalf of the initiating `User`'s own permissions, never as its own
principal.
**The grant that ends itself** — n/a: no new role or grant; click-to-call
is gated by an ordinary permission (§7).
**Whose rows, and which columns** — `CallLog.organizationId` scopes every
read identically to every other table; a branch/location-scoped role sees
only calls its own staff placed or received, mirroring doc 64's own
ticket-visibility rule.
**The threshold nobody approves alone** — n/a: a phone call carries no
money or stock value of its own to threshold-gate.
**The toxic pair** — n/a: no self-approval risk in placing or logging a
call.
**Authority and blast radius** — who may configure `TELEPHONY_PROVIDERS`
and the provider's own API credentials is gated identically to any other
`AppConfigService`-backed secret (doc 00's own env-secret discipline).
**Audience is a capability, not an address** — an inbound call routes to
whichever `User`s hold a calling-eligible role for that branch/department,
resolved the same `PERMISSION_CATALOG`-plus-scope way every other audience
in this repository resolves, never a hardcoded extension number.
**Request or record** — stated in full in §2: `initiateCall()` is a
REQUEST, the resulting `CallLog` is a RECORD once the provider confirms the
call happened.
**The movement with no address** — n/a: no stock or cash movement.
**Four hours down, the counter stays open** — with the configured
telephony provider itself unreachable, staff fall back to their own phones
and dial manually; the only loss is the automatic `CallLog` row, which a
manager can backfill by hand (a small manual-entry form, WO-159.4) rather
than the call itself being blocked.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity / Dry run before live** — n/a: no
GL posting of its own.
**Click the number** — a `Contact`'s own detail screen shows its full call
history (`CallLog` filtered by `contactId`), each row linking to its own
recording and, where one exists, the `SupportTicket` it opened — the
drill-down this repository's own "click the number" lens requires.
**Three silhouettes** — Solo: one shared business number, every call
visible to the single admin. Chain: `CallLog` scoped per `Location`
exactly as every other operational table already is; a branch's own
click-to-call uses that branch's own configured number/extension where the
provider supports per-branch numbers. Organization: cross-brand call
volume/duration reporting is a straightforward aggregation over the same
table, no new mechanism.
**The absent collaborator** — with `TELEPHONY_PROVIDERS` empty (the
default), every click-to-call entry point renders in its own named
"not connected" state (doc 156/design-system's own "every state shipped"
discipline) rather than a broken or hidden button.
**The second copy of the write** — `@@unique([providerKey, providerCallId])`
makes a redelivered webhook (the identical retry risk every other webhook
receiver in this repository already names) a no-op, never a duplicate
`CallLog` row.
**The hundred-thousandth row** — indexed on `(contactId, startedAt)` for
a contact's own call history and `(ticketId)` for a ticket's own call
thread — both real, bounded query patterns a support screen actually runs.
**The reversal document, not the reversal flag / The undo fan-out** —
n/a: a completed call is never "undone"; a mistaken `CallLog` row (wrong
contact match, say) is corrected by editing the match, never deleted per
this repository's own no-deletion-without-confirmation rule — the
resolution is a data correction, not an erasure.
**The version stamp** — n/a: a call's own facts (who, when, how long) are
immutable once the provider reports them.
**The erasure the ledger cannot obey** — `CallLog.contactId` names a
person; a `Contact` erasure request handles this table the same way it
already must handle every other table naming that contact (doc 06/07's own
existing erasure path), including the stored recording via
`StorageService`'s own deletion path.
**The failure path** — a `parseWebhook()` call that returns `null`
(unverified or unparseable) is logged and dropped, never thrown all the
way up to crash the receiving endpoint that every other provider also
posts to.

## Work orders

**WO-159.1 — schema**: `CallLog`, `CallDirection`, `CallStatus`, forward-
only migration.
**WO-159.2 — `TelephonyProvider` interface** + one real vendor
implementation once an account is chosen (the identical, named "blocked
on picking a real gateway" state doc 33 already carries for SMS/WhatsApp —
this document does not resolve that choice, only removes the architecture
blocker).
**WO-159.3 — inbound webhook endpoint**, `@Public()`, doc 132-style
templated/registered receiver, verifying every delivery before writing
anything.
**WO-159.4 — `captureRecording()`** over `StorageService`, plus the manual
call-log backfill form for the "provider unreachable" fallback (§ "Four
hours down").
**WO-159.5 — UI**: a click-to-call action on a `Contact`'s/`Order`'s own
detail screen, the "not connected" empty state when no provider is
configured, and the call-history section on the contact timeline.
**WO-159.6 — permissions**: `telephony.calls.place`/`.view`, seeded to
whichever roles doc 64's own support/sales roles already hold, never a
new, unseeded permission row.

## Acceptance

- With `TELEPHONY_PROVIDERS` empty, every click-to-call entry point renders
  its own named empty state, never a broken action.
- An unsigned/unverified inbound call webhook writes no `CallLog` row,
  proven by a spec — the same discipline doc 155's payment callback
  already enforces.
- A redelivered webhook for the same `providerCallId` is a no-op, proven
  by a spec.
- A `Contact`'s own detail screen shows its full call history with working
  drill-down to each recording and any ticket the call opened.

## Out of scope

An IVR call-tree builder, skill-based/ACD routing, and an AI voice agent
answering calls — each real, separately-scoped work, named honestly rather
than folded in here; this document builds the provider-swap foundation
(placing a call, receiving a call event, logging it, recording it) those
would all sit on top of, not the call-flow logic itself. A softphone/
WebRTC in-browser dialer — a real UX improvement over "click to have the
provider ring my own desk phone," but a separate, larger client-side
capability than this document's own scope.
