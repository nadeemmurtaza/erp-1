# 101 — SMS/WhatsApp/self-hosted email: two already fully specified, one already fully built

"Standardize outbound communications by triggering webhooks that route
messages seamlessly through SMS, WhatsApp, or self-hosted email
infrastructure" names three channels against the `NotificationChannel`
interface (`notification-channel.ts`) — the identical registered-provider
pattern `PaymentProvider`/`StorageDriver`/`AiProvider` already use. Two of
the three are fully specified, not yet implemented; the third already
exists in production shape today.

## What already exists, per channel

- **Self-hosted email** — `EmailChannel` (`apps/api/src/core/notifications/
  email.channel.ts`) already sends over raw SMTP (`SMTP_HOST`,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_PORT`, `SMTP_SECURE`), with a
  documented fallback path ("a store with none configured falls back to
  the single SMTP_* transport this channel has always used") — this is
  already "self-hosted email infrastructure," not a SaaS-only sender with
  no self-hosted option.
- **SMS and WhatsApp** — doc 33 (`33-outbound-sms-whatsapp-channels.md`)
  already specifies `SmsChannel`/`WhatsAppChannel` against the identical
  `NotificationChannel` interface `EmailChannel`/`log.channel.ts` already
  implement — "no caller changes" needed, per `notification-channel.ts`'s
  own header comment doc 33 cites. **Neither file exists in code yet**
  (confirmed: no `sms.channel.ts`/`whatsapp.channel.ts` under
  `core/notifications/`) — doc 33 is a complete, ready-to-build brief, not
  yet implemented.

## "Triggering webhooks" — the delivery mechanism doc 33 already names

Doc 33's own `SmsProvider`/`WhatsAppProvider` interfaces (WO-33.3) are
themselves the "webhook" half of this bullet: an outbound HTTP call to a
gateway (Twilio-shaped for SMS, the WhatsApp Business API for WhatsApp),
retried on failure (WO-33.5's own cron), logged per delivery
(`OutboundMessageLog`, WO-33.1). This is not a new mechanism to design —
it is doc 33's own already-written work order, waiting on the same class
of decision doc 15's FBR/PRA work and doc 88's PRAL note already name
explicitly: **which real SMS/WhatsApp gateway provider a given deployment
will actually use**, since the payload shape differs meaningfully
provider to provider (WhatsApp's own Business API requires pre-approved
message templates, a real compliance constraint doc 33's own `WhatsAppProvider`
interface must be built against once a specific provider is chosen, not
guessed).

## Scope lenses

Not repeated — doc 33's own scope lenses already answer every lens for
this exact mechanism.

## Work orders

**WO-101.1 — implement doc 33's own WO-33.1 through WO-33.7** once a real
SMS gateway and a real WhatsApp Business API provider are selected —
this document adds no new work order beyond pointing at doc 33's already-
complete brief and naming the provider-selection blocker explicitly.

## Acceptance

- No new schema or interface — doc 33's own `SmsChannel`/`WhatsAppChannel`
  design, once implemented, requires no change to
  `NotificationChannel`/`NOTIFICATION_CHANNELS`'s own existing shape.
- Self-hosted email continues to work exactly as `EmailChannel` already
  delivers it — no change required.

## Out of scope

Selecting a specific SMS/WhatsApp gateway vendor — a real commercial and
compliance decision (WhatsApp template pre-approval, per-country SMS
gateway coverage) for the deploying business to make, not a technical
choice this document makes on their behalf.
