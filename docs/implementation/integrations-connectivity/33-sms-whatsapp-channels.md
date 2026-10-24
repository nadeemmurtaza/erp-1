# 33 — Outbound SMS and WhatsApp notification channels

`notification-channel.ts`'s own header already names this exact gap: "Email,
WhatsApp and SMS channels are new classes implementing this interface plus
an entry in `NOTIFICATION_CHANNELS` — no caller changes." This document is
that implementation brief. It is deliberately narrow, because the interface,
the recipient shape and the registration pattern already exist — `email.
channel.ts` and `log.channel.ts` are the two working examples this follows.

**This is not `09-ai-layer.md` WO-9.7's WhatsApp assistant.** WO-9.7 is a
conversational bot that *answers inbound* order questions through the
WhatsApp Business API. This document is the *outbound* half — receipts,
order-status updates, marketing sends — through the same
`NotificationChannel` interface every other transactional message already
uses. WO-9.7 will end up depending on the WhatsApp send path this document
builds; this document does not depend on WO-9.7 and ships whether or not
that assistant is ever built.

## 1. Two channels, one interface, no caller changes

```ts
// apps/api/src/core/notifications/sms.channel.ts
export class SmsChannel implements NotificationChannel {
  readonly name = 'sms';
  supports(message: NotificationMessage) { return !!message.recipient.phone; }
  async send(message: NotificationMessage) {
    // provider call — see the extension point below
  }
}

// apps/api/src/core/notifications/whatsapp.channel.ts
export class WhatsAppChannel implements NotificationChannel {
  readonly name = 'whatsapp';
  supports(message: NotificationMessage) { return !!message.recipient.phone; }
  async send(message: NotificationMessage) {
    // provider call — see the extension point below
  }
}
```

Every existing call site that already sends a `NotificationMessage` (order
confirmation, stitching-ready, low-stock alert, doc 26/27/28/29's own
notification lenses) needs **zero changes** — this is the entire point of
building against the interface rather than a concrete channel. Which
channels actually fire for a given message is a per-organization/per-
template setting (below), not a code change per template.

## 2. The provider is a second, smaller extension point underneath the channel

Neither channel talks to Twilio, Meta's WhatsApp Business API, or a local
gateway directly — that goes through its own provider interface, the same
two-layer shape `payments` already uses (`PaymentProvider` under
`payments.service.ts`, `Easypaisa`/`JazzCash` as implementations verified by
`callback-verification.spec.ts`):

```ts
// apps/api/src/core/notifications/sms-provider.ts
export interface SmsProvider {
  send(to: string, body: string): Promise<{ providerMessageId: string }>;
}

// apps/api/src/core/notifications/whatsapp-provider.ts
export interface WhatsAppProvider {
  sendTemplate(to: string, templateName: string, params: Record<string, string>): Promise<{ providerMessageId: string }>;
}
```

`WhatsAppProvider.sendTemplate` takes a template name, not a free-form body,
because WhatsApp Business API requires pre-approved message templates
outside a 24-hour customer-service window — this is a real constraint of
the channel, not an API design choice, and building `send(body: string)`
here would produce a channel that fails in production the first time it is
used for anything but a reply inside that window.

## Schema — new `outbound-messaging.prisma`

```prisma
/// One row per attempted send, regardless of channel — the audit trail
/// "did the customer actually get this receipt" needs, and the retry queue
/// below reads.
model OutboundMessageLog {
  id             String   @id @default(cuid())
  channel        String   /// "sms" | "whatsapp" | "email" | "log" — matches NotificationChannel.name
  template       String
  recipientPhone String?
  recipientEmail String?
  status         MessageStatus @default(QUEUED)
  providerMessageId String?
  failureReason  String?
  sentAt         DateTime?
  createdAt      DateTime @default(now())

  @@index([channel, status])
  @@index([template, createdAt])
}

enum MessageStatus { QUEUED SENT FAILED }

/// Per-organization, per-template channel selection — "order.confirmed"
/// goes to whatsapp then sms as fallback; "marketing.promo" goes to
/// whatsapp only and never sms, because SMS marketing costs per-message in
/// a way a client may not want. Rows, not a hardcoded per-template switch.
model NotificationChannelPreference {
  id             String @id @default(cuid())
  organizationId String
  template       String
  /// Ordered — first channel that supports() the recipient and succeeds
  /// wins; the rest are fallback, not simultaneous fan-out, so a customer
  /// never gets the same receipt twice over two channels.
  channelOrder   String[]

  @@unique([organizationId, template])
}
```

`channelOrder` as an ordered array, not a boolean per channel, is what makes
fallback ("WhatsApp first, SMS if WhatsApp fails") expressible without a
second table — the same reasoning `LeaveType`/`Rank` give rows over enums:
one client wants WhatsApp-only, the next wants SMS-only, a third wants
fallback, and none of the three should need a schema change.

## Scope lenses

**The actor with three tables** — n/a: no new counterparty; recipients are
the existing `NotificationRecipient` shape.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a.
**Whose rows, and which columns** — `OutboundMessageLog.recipientPhone`/
`recipientEmail` are visible only to `notifications.admin`, never to a
general support-staff view of a customer's order.
**The threshold nobody approves alone** — n/a: no money or stock committed
(a paid SMS-provider send costs money at the account level, not per
approval — rate-limiting, not an approval chain, is the real control, named
under "the failure path" below).
**The toxic pair** — n/a.
**Authority and blast radius** — who may set `NotificationChannelPreference`
for a template, at which organization; the worst value is routing a
sensitive template (a password-reset code) to a channel with no delivery
receipt, which the admin screen flags but does not block, since a client's
choice to accept that risk is theirs to make once informed.
**Audience is a capability, not an address** — restated because it is the
whole point of this document: every send resolves its recipient from the
`NotificationRecipient` the caller already built (itself resolved from a
permission/relationship elsewhere, e.g. doc 26's `reportsTo` walk), never a
phone number typed into a template.
**Request or record** — a send attempt is a REQUEST (provider can refuse:
invalid number, rate limit, template not approved); once `SENT`, the log row
is a RECORD of what was attempted and never rewritten, only appended to by a
later delivery-status webhook (below).
**The movement with no address** — n/a.
**Four hours down, the counter stays open** — a provider outage queues
`OutboundMessageLog` rows at `QUEUED` and a retry cron (below) drains them
on recovery — a receipt that could not send immediately is not lost, it is
delayed, exactly the outbox discipline `EventBusService`/`OutboxDispatcher`
already apply to domain events.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: posts no `JournalLine`.
**The second legal entity** — `NotificationChannelPreference` scoped per
`organizationId`; a second legal entity picks its own channel order and
provider account, never inherits the first's silently.
**Dry run before live** — `resolveChannelOrder(organizationId, template)` is
a pure lookup with no side effect, callable from an admin preview ("which
channel would this template use") before any message sends.
**Three silhouettes** — Solo: one provider account, `log` channel in
development, real channel in production, no preference rows needed (falls
back to a sane default order). Chain: shared provider account across
branches, one preference set per brand. Organization: potentially one
provider account per brand/legal entity (WhatsApp Business API is
account-scoped), named as a real future need rather than assumed today.
**The absent collaborator** — with no `SmsProvider`/`WhatsAppProvider`
implementation registered, `supports()` still returns true for a recipient
with a phone, but `send()` fails cleanly and falls through to the next
channel in `channelOrder` (or `log`, which always exists) — never a silent
drop, never a boot failure.
**The second copy of the write** — a redelivered domain event that triggers
the same notification twice is deduplicated at the caller (the existing
outbox idempotency for the event itself), not re-solved here; this module's
own idempotency is per attempt — retrying a `FAILED` `OutboundMessageLog`
row updates that row's status, it does not insert a second one for the same
attempt.
**The hundred-thousandth row** — message volume can exceed order volume
(marketing sends fan out to many recipients per campaign); bounded by
`[channel, status]` for the retry cron's own query and `[template,
createdAt]` for the delivery-rate dashboards a client will eventually ask
for; old `SENT` rows age out under a retention policy, `FAILED` rows kept
longer for investigation.
**The reversal document** — n/a: a message, once sent, cannot be unsent; a
wrongly-configured `NotificationChannelPreference` is corrected going
forward, never retroactively reinterpreting messages already sent under it.
**The undo fan-out** — n/a.
**The version stamp** — an `OutboundMessageLog` row records the
`channelOrder` actually used at send time (denormalized), so a later
preference change does not reinterpret why an old message went out on a
particular channel.
**The erasure the ledger cannot obey** — `OutboundMessageLog.recipientPhone`/
`recipientEmail` are deleted (not merely pseudonymised) on a data-subject
erasure request past the retention window, since a message log serves no
audit purpose once its short delivery-investigation window has passed —
contrast with doc 28's `EmployeeDocument`, whose `LEGAL_OBLIGATION` basis
is a real, ongoing exception this module has none of.
**The failure path** — a provider send failure sets `status = FAILED` with
`failureReason`, visible on an admin retry screen with a manual replay
action; a provider account rate-limit response backs off the retry cron
exponentially rather than hammering the provider — named explicitly since
"the failure path" here is also the real production risk (a provider
account suspended for sending too fast) this document must not create.

## Work orders

**WO-33.1 — schema**: `OutboundMessageLog`, `NotificationChannelPreference`.
**WO-33.2 — `SmsChannel`/`WhatsAppChannel`** + registration in
`NOTIFICATION_CHANNELS`, following `email.channel.ts`'s exact shape.
**WO-33.3 — `SmsProvider`/`WhatsAppProvider`** interfaces + one
implementation each (a Twilio-shaped SMS provider, a WhatsApp Business API
provider), verified the same way `EasypaisaProvider`/`JazzCashProvider`
verify a webhook before trusting it.
**WO-33.4 — `resolveChannelOrder()`** pure lookup + fallback-on-failure
dispatch (try channel 1, on failure try channel 2, log every attempt).
**WO-33.5 — retry cron**: drains `QUEUED`/`FAILED` rows with exponential
backoff, following `InventoryCron`'s existing cron pattern.
**WO-33.6 — permissions**: `notifications.admin` (channel preferences,
message log, retry).
**WO-33.7 — UI**: channel preference screen per template, message log with
filter and manual retry, delivery-rate tile per channel.

## Acceptance

- Sending "order.confirmed" through this system requires no change to the
  code that already builds and sends that `NotificationMessage` — proven by
  running the existing order-confirmation notification test unchanged with
  a `NotificationChannelPreference` row added.
- A `WhatsAppProvider` failure falls through to the next configured channel
  and both attempts are visible in `OutboundMessageLog`.
- A forged provider delivery webhook is rejected, never trusted to update a
  message's status.
- With no provider registered, sends resolve to `log` and the boot/pack-
  absence test still passes.
- The retry cron backs off after a rate-limit response rather than retrying
  immediately.

## Out of scope

Inbound WhatsApp/SMS handling (WO-9.7's own scope, unaffected by this
document), rich media (images, PDFs) over SMS (a channel limitation, not a
missed requirement — WhatsApp media is a later, named extension of
`WhatsAppProvider`, not blocking this brief), a marketing-campaign builder
(this document is the delivery channel; `marketing`'s existing module is
where a campaign is composed and targeted).
