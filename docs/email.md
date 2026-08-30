# Transactional email

Order confirmations, payment receipts, order status changes and stitching
updates, in English and Urdu, sent from our own mail server on the VPS.

## Read this first

Self-hosting outbound mail is free and gives up nothing to a vendor, but it is
the one part of this stack where doing everything right still is not always
enough. Gmail — where most of your customers are — decides whether to accept
mail from a brand-new server IP largely on reputation it has not yet formed.

Three things are not optional, and all three live outside this repository:

1. **Outbound port 25 must be open.** Most VPS providers block it by default:
   DigitalOcean, Vultr, Hetzner, Oracle and AWS all do. Unblocking is a support
   ticket, and some providers refuse. **Check this before anything else** — if
   port 25 is blocked, self-hosting cannot deliver mail at all and no amount of
   configuration will change that.
2. **A PTR record** on the VPS IP pointing at `mail.yaseen.pk`, set in the
   provider's control panel rather than in DNS hosting. Receivers check that
   the forward and reverse records agree and reject when they do not.
3. **SPF, DKIM and DMARC** published for `yaseen.pk`. Since February 2024 Gmail
   and Yahoo require all three from bulk senders.

If your provider will not open port 25, stop here and use a relay instead — see
[Switching to a relay](#switching-to-a-relay). Nothing in the application code
changes either way; that is the point of keeping the transport plain SMTP.

## Setup

### 1. Check port 25 before you build anything

```bash
nc -zv gmail-smtp-in.l.google.com 25
```

A connection means you are clear. A hang or refusal means the provider is
blocking it — raise a ticket, and do not continue until it succeeds.

Also check the IP is not already on a blocklist. VPS ranges often are, inherited
from whoever had the address before you:

```bash
# Reverse the octets of your IP: 203.0.113.45 -> 45.113.0.203
dig +short 45.113.0.203.zen.spamhaus.org
```

Any answer at all is a listing. Most have a self-service delisting form.

### 2. Point DNS at the server

| Type | Name | Value |
|---|---|---|
| A | `mail.yaseen.pk` | your VPS IP |
| PTR | (VPS IP) | `mail.yaseen.pk` — set in the **provider's panel** |

### 3. Start the mail server

```bash
docker compose -f docker-compose.mail.yml up -d
```

It generates a DKIM key on first start. Read the public half out:

```bash
docker compose -f docker-compose.mail.yml exec smtp \
  cat /etc/opendkim/keys/yaseen.pk/mail.txt
```

That prints a TXT record split across quoted strings. Join the quoted parts
into one value, dropping the quotes and whitespace between them.

### 4. Publish SPF, DKIM and DMARC

| Type | Name | Value |
|---|---|---|
| TXT | `yaseen.pk` | `v=spf1 mx a ip4:YOUR_VPS_IP -all` |
| TXT | `mail._domainkey.yaseen.pk` | `v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBg…` (from step 3) |
| TXT | `_dmarc.yaseen.pk` | `v=DMARC1; p=none; rua=mailto:dmarc@yaseen.pk; pct=100` |

Start DMARC at `p=none`. It reports without rejecting, so a mistake in SPF or
DKIM shows up in the reports instead of silently binning every order
confirmation. Move to `p=quarantine` once a week of reports comes back clean.

`-all` in SPF means "nothing else may send as us". Use `~all` instead while
testing if anything else — a CRM, an invoicing tool — also sends as
`@yaseen.pk`.

### 5. Point the API at it

In `.env.production`:

```ini
NOTIFICATION_CHANNELS="log,email"
SMTP_HOST="smtp"
SMTP_PORT=587
SMTP_SECURE=false
MAIL_FROM="Yaseen <no-reply@yaseen.pk>"
MAIL_REPLY_TO="hello@yaseen.pk"
STORE_NAME="Yaseen"
STOREFRONT_URL="https://yaseen.pk"
SUPPORT_WHATSAPP="+92 321 1110813"
BANK_TRANSFER_DETAILS="Meezan Bank — Yaseen
IBAN: PK00 MEZN 0000 0000 0000 0000
Account title: Yaseen"
```

`SMTP_HOST` is the service name: the API reaches it over the private Docker
network, so no username or password is involved and nothing outside the network
can relay through it.

Keeping `log` alongside `email` means every message stays visible in the API
log, which is where you look when a customer says they never got anything.

The API refuses to boot if `email` is listed without an `SMTP_HOST`, so a
half-finished deploy fails loudly instead of quietly dropping confirmations.

### 6. Test before you trust it

Send a real order to <https://www.mail-tester.com>, which scores the message
out of 10 and names anything missing. Below 8 means something above is wrong.

Then send one to a Gmail address and use **Show original**. You want:

```
SPF:   PASS
DKIM:  PASS
DMARC: PASS
```

## Warming up

A new IP that suddenly sends hundreds of messages looks exactly like a
compromised host. Real order volume ramps naturally, which is usually warm-up
enough — but do not import an old customer list and mail it on day one.

Watch the queue for the first few weeks:

```bash
docker compose -f docker-compose.mail.yml exec smtp mailq
docker compose -f docker-compose.mail.yml logs --tail=200 smtp
```

A queue that grows rather than drains means mail is being deferred — the logs
name the receiver and the reason.

## Switching to a relay

If deliverability disappoints, or the provider will not open port 25, point the
same four variables at a relay. No application code changes:

```ini
SMTP_HOST="smtp.resend.com"     # or smtp.sendgrid.net, email-smtp.<region>.amazonaws.com
SMTP_PORT=587
SMTP_USER="…"
SMTP_PASSWORD="…"
```

The SPF and DKIM records change to whatever the relay specifies. Everything
else — templates, subscribers, the channel — is untouched.

## How it works

```
order placed ──> outbox ──> order.placed ──> OrderNotificationSubscriber
                                                      │
                                             NotificationsService
                                          ┌───────────┼───────────┐
                                        log      expo_push      email
```

`NOTIFICATION_CHANNELS` decides which of those run. A channel that cannot reach
someone declines: a guest who checked out with only a phone number gets no
email, and the other channels still fire.

| Event | Template | Sent when |
|---|---|---|
| `order.placed` | `order.confirmed` | Every order. Carries bank details while a transfer is outstanding. |
| `payment.succeeded` | `payment.received` | A transfer or gateway payment clears. Skipped for cash on delivery. |
| `order.status_changed` | `order.status_changed` | Shipped, delivered, cancelled or refunded only. |
| `stitching.job_stage_changed` | `stitching.*` | The garment moves through the workshop. |

Adding another email is a `notifications.send()` call. A template with no
layout registered still goes out, wrapped in the standard shell using its own
subject and body, so designing the layout is never a prerequisite for sending.

### Language

Emails follow the customer's language, and the wording lives in
`apps/api/src/core/notifications/email/copy.ts` as one interface with an English
and an Urdu implementation — so a string added to one fails the build until the
other has it.

Urdu mail is right-to-left, and money, phone numbers and IBANs are pinned
left-to-right. Without that pinning a discount renders as `Rs 500 -` and a phone
number as `6003165 0318`; there are tests covering both.

The only language preference the schema records today is on `DeviceToken`, set
when the mobile app registers for push. **So app customers get Urdu mail and
everyone else gets English.** Covering web customers means capturing the
storefront locale on the order — a nullable `locale` column on `Order`, written
at checkout from the locale-prefixed route the order came from, and read in
`OrderNotificationSubscriber.localeFor`.

### Duplicates

Outbox delivery is at-least-once and the subscribers are not idempotent, so a
retry sends a second copy. That is a deliberate trade for now — a duplicate
confirmation is a better failure than a missing one — and it matches how the
existing stitching notifications already behave. Making it exactly-once needs a
sent-notification table to check against.
