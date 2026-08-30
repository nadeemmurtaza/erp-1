# Transactional email

Order confirmations, payment receipts, order status changes and stitching
updates, in English and Urdu, sent from our own mail server on the VPS.

## What runs, and what it reuses

One new container. Nothing is duplicated.

| | |
|---|---|
| Mail server | **Stalwart** — SMTP, IMAP and JMAP in a single Rust binary |
| Metadata | the **existing Postgres**, in its own `stalwart` database |
| Rate limits, locks, ACME tokens | the **existing Redis**, on database index 1 |
| Message bodies | a local volume — deliberately *not* Postgres |
| Admin UI | fronted by the **existing Caddy** at `mail.yaseen.pk` |

Stalwart was chosen over mailcow for exactly this. mailcow ships its own
MariaDB and its own Redis and cannot be pointed at existing ones, so it would
have meant a second database engine on the box for no benefit. It also wants
~6 GB against Stalwart's ~150 MB idle, and nine containers against one.

Two deliberate separations:

- **Its own database, not its own server.** `pnpm db:reset` drops and re-creates
  the shop's database; sharing one would mean a routine reset destroys every
  mailbox. Prisma also owns the shop's schema, and mail tables beside it would
  make every future migration ambiguous.
- **Its own unprivileged role.** `stalwart` owns only the `stalwart` database,
  so a compromised mail server cannot read orders or customers.

## Read this first

Self-hosting outbound mail is free and gives up nothing to a vendor, but it is
the one part of this stack where doing everything right still is not always
enough. Gmail — where most customers are — decides whether to accept mail from
a brand-new server IP largely on reputation it has not yet formed.

Three things are not optional, and all three live outside this repository:

1. **Outbound port 25 must be open.** Many VPS providers block it by default.
   Unblocking is a support ticket. **Check this before anything else** — if
   port 25 is blocked, self-hosting cannot deliver at all.
2. **A PTR record** on the VPS IP pointing at `mail.yaseen.pk`, set in the
   provider's control panel rather than in DNS hosting. Receivers check that
   the forward and reverse records agree and reject when they do not.
3. **SPF, DKIM and DMARC** published for `yaseen.pk`. Since February 2024 Gmail
   and Yahoo have required all three from bulk senders.

If your provider will not open port 25, use a relay instead — see
[Switching to a relay](#switching-to-a-relay). No application code changes
either way; that is why the transport is plain SMTP.

## Setup

### 1. Check port 25 before you build anything

```bash
nc -zv gmail-smtp-in.l.google.com 25
```

A connection means you are clear. A hang or refusal means the provider is
blocking it — raise a ticket, and do not continue until it succeeds.

### 2. Point DNS at the server

| Type | Name | Value |
|---|---|---|
| A | `mail.yaseen.pk` | your VPS IP |
| MX | `yaseen.pk` | `mail.yaseen.pk` priority 10 |
| PTR | (VPS IP) | `mail.yaseen.pk` — in the **provider's panel** |
| CNAME | `autodiscover.yaseen.pk` | `mail.yaseen.pk` |
| CNAME | `autoconfig.yaseen.pk` | `mail.yaseen.pk` |

The A and MX records already exist and are correct. The PTR is currently a
generic Contabo hostname and must be changed.

### 3. Give the mail server its own database

```bash
openssl rand -base64 32          # put this in .env.production as MAIL_DB_PASSWORD

docker exec -i yaseen-postgres-prod psql -U yaseen -d postgres \
  -v mail_password="'THE_PASSWORD_YOU_JUST_GENERATED'" \
  < deploy/mail/init-postgres.sql
```

Creates the `stalwart` role and database inside the Postgres already running.
Idempotent, so re-running after a partial setup is safe.

### 4. Start it

```bash
docker compose -f docker-compose.mail.yml up -d
```

On first start Stalwart prints a one-time admin password to its log:

```bash
docker compose -f docker-compose.mail.yml logs stalwart | grep -i password
```

Then apply the storage settings from `deploy/mail/stalwart-config.toml` — either
by merging them into `/opt/stalwart/etc/config.toml` before first start, or in
the admin UI under **Settings → Storage**. Those are what point it at the
existing Postgres and Redis instead of its own embedded store.

### 5. Certificates

Caddy owns 80 and 443, so Stalwart's ACME client cannot complete an HTTP-01 or
TLS-ALPN-01 challenge. Caddy obtains the certificate for `mail.yaseen.pk`
instead, and a timer copies it to Stalwart, which serves SMTP and IMAP itself
and needs it on disk:

```bash
sudo cp deploy/systemd/yaseen-mailcert.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yaseen-mailcert.timer
sudo systemctl start yaseen-mailcert.service    # run it once now
```

> **The cleaner alternative:** DNS-01 needs no ports at all, but it needs a DNS
> provider with an API. `yaseen.pk` is on Contabo's nameservers, which have
> none. Moving DNS to Cloudflare is free, takes about ten minutes, and would
> let Stalwart handle its own certificates — deleting this script and its
> timer entirely.

### 6. Create the mailboxes

In the admin UI at `https://mail.yaseen.pk`:

| Mailbox | For |
|---|---|
| `no-reply@yaseen.pk` | the store's SMTP account — the API signs in as this |
| `hello@yaseen.pk` | where customer replies land |
| `dmarc@yaseen.pk` | where the DMARC reports go |

Give `no-reply@` its own password. The API is a client like any other, not an
administrator.

### 7. Publish SPF, DKIM and DMARC

Generate the DKIM key in the admin UI, then publish:

| Type | Name | Value |
|---|---|---|
| TXT | `yaseen.pk` | `v=spf1 mx a ip4:YOUR_VPS_IP -all` |
| TXT | `<selector>._domainkey.yaseen.pk` | the key from the admin UI |
| TXT | `_dmarc.yaseen.pk` | `v=DMARC1; p=none; rua=mailto:dmarc@yaseen.pk` |

Start DMARC at `p=none`. It reports without rejecting, so a mistake in SPF or
DKIM shows up in the reports rather than silently binning every order
confirmation. Move to `p=quarantine` once a week of reports is clean.

`-all` means "nothing else may send as us". Use `~all` while testing if
anything else also sends as `@yaseen.pk`.

### 8. Point the API at it

In `.env.production`:

```ini
NOTIFICATION_CHANNELS="log,email"
SMTP_HOST="mail.yaseen.pk"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="no-reply@yaseen.pk"
SMTP_PASSWORD="the password you set in step 6"
MAIL_FROM="Yaseen <no-reply@yaseen.pk>"
MAIL_REPLY_TO="hello@yaseen.pk"
STORE_NAME="Yaseen"
STOREFRONT_URL="https://yaseen.pk"
SUPPORT_WHATSAPP="+92 321 1110813"
BANK_TRANSFER_DETAILS="Meezan Bank — Yaseen
IBAN: PK00 MEZN 0000 0000 0000 0000
Account title: Yaseen"
```

`SMTP_HOST` is the hostname, not the container name: the certificate is issued
for `mail.yaseen.pk`, and connecting as `stalwart` would fail TLS hostname
verification. The container answers to `mail.yaseen.pk` on the private network
through a Docker network alias, so this never leaves the box and the
certificate still matches. The fix for a hostname mismatch is never to turn
verification off.

Keeping `log` alongside `email` means every message stays visible in the API
log, which is where you look when a customer says nothing arrived.

The API refuses to boot if `email` is listed without an `SMTP_HOST`, so a
half-finished deploy fails loudly instead of quietly dropping confirmations.

### 9. Check it, don't assume it

```bash
MAIL_FROM="Yaseen <no-reply@yaseen.pk>" pnpm check:email yaseen.pk YOUR_VPS_IP --selector=YOUR_DKIM_SELECTOR
```

Checks the A record, PTR, MX, SPF, DKIM, DMARC, From-domain alignment, three
blocklists and outbound port 25, and prints the fix for anything failing. It
exits non-zero on failures, so cron can run it and shout.

**Run it from the VPS.** Port 25 and the blocklist lookups only tell the truth
from the machine that actually sends.

State of `yaseen.pk` when this was written:

| Check | Result |
|---|---|
| `mail.yaseen.pk` A record | resolves to the Contabo VPS |
| MX | present, `mail.yaseen.pk` priority 10 |
| PTR | **fails** — reverses to `vmi3529119.contaboserver.net` |
| SPF | **missing** |
| DKIM | **missing** |
| DMARC | **missing** |
| Blocklists | clean on Spamhaus, Barracuda and SpamCop |

A generic provider hostname in the PTR is a strong spam signal by itself, and
with no SPF, DKIM or DMARC there is nothing for Gmail to authenticate against.
The clean blocklist result is the good news — a listed IP is much harder to
recover from than missing DNS.

Note the MX already points at `mail.yaseen.pk`, so mail to the domain is
being directed at a host that is not yet answering. Anyone emailing
`@yaseen.pk` today gets a bounce or a timeout.

### 10. Test before you trust it

Send a real order to <https://www.mail-tester.com>, which scores the message
out of 10 and names anything missing. Below 8 means something above is wrong.

Then send one to a Gmail address and use **Show original**. You want:

```
SPF:   PASS
DKIM:  PASS
DMARC: PASS
```

## Reading the mail

Stalwart is a mail *server*; it has an admin UI but no webmail client. Three
ways to actually read `hello@yaseen.pk`, cheapest first:

1. **Forward to Gmail.** Set `hello@` to forward to an existing Gmail account
   and use Gmail's "Send mail as" pointed at `mail.yaseen.pk:587`. Replies then
   go out *from* `hello@yaseen.pk`. No extra container, nothing to patch.
   Forwarding can trip SPF at the receiving end; Stalwart can do SRS to fix it.
2. **Any IMAP client.** Thunderbird, Apple Mail, the Gmail app. The
   autodiscover records in step 2 mean it configures itself.
3. **A webmail container.** SnappyMail is lightest and needs no database;
   Roundcube is the most battle-tested and runs on SQLite. Either is one
   container behind a `webmail.yaseen.pk` block in the Caddyfile.

## Backups

`deploy/backup.sh` dumps the `stalwart` database alongside the shop's, restores
each into a scratch database to prove it loads, and ships both off-site. It
skips the mail dump cleanly when the database does not exist yet.

**Message bodies are not in that dump.** They live on the `stalwart-data`
volume, deliberately, so every nightly dump does not grow by the size of every
attachment ever received. A full mail restore therefore needs both:

```bash
# the volume, alongside the database dump
docker run --rm -v stalwart-data:/data -v "$PWD":/backup alpine:3 \
  tar czf /backup/stalwart-blobs-$(date -u +%Y%m%d).tar.gz -C /data .
```

Add that to the backup routine if mailbox history matters to you. It is not in
`backup.sh` because the right cadence for it depends on how much mail you keep.

## Staying out of spam

Authentication makes you *eligible* for the inbox. Reputation decides the rest,
and a brand-new VPS address has none — so the early weeks are the fragile part,
not the configuration.

What the code already does, so it does not have to be remembered:

- **Every message has a plain-text part** alongside the HTML. HTML-only mail
  scores worse, and a young sender cannot spare the points.
- **The envelope sender is pinned** to the same domain as the visible `From`,
  so SPF is checked against the domain DMARC will compare against. Left alone,
  alignment would rest on DKIM by itself.
- **Message-IDs are built from our own domain**, not the machine hostname —
  which inside a container is a random hex string, and `<…@4f2a9c1b8e77>` reads
  as botnet output.
- **`Auto-Submitted: auto-generated`** marks the mail transactional, so
  out-of-office autoresponders do not reply to it and bounce back at us.
- **Obviously undeliverable addresses are never attempted.** A hard bounce
  costs a young domain more than a missed email; receivers read a bounce rate
  as a sign of a bought list.
- **A sender that cannot pass DMARC is refused at boot** — setting `MAIL_FROM`
  to a Gmail or Yahoo address logs an error, because those domains publish a
  reject policy precisely so nobody else can send as them.

What is on you:

- **Fix the PTR.** A generic `vmi….contaboserver.net` reverse name is one of
  the clearest "unmanaged VPS" signals there is.
- **Read the DMARC reports.** `p=none` with a `rua=` address costs nothing and
  tells you what is failing before customers notice.
- **Keep the bounce rate down.** Above roughly 2–3% and receivers start
  throttling. The address check helps; a real suppression list would help more.
- **Do not import an old list and mail it.** Order volume ramps naturally,
  which is the warm-up. A cold IP sending hundreds at once looks compromised.
- **Never put the store's own mail behind a URL shortener**, and keep links
  pointing at `yaseen.pk`. Link and sender domains that disagree score badly.

There is no `List-Unsubscribe` header on order mail, deliberately: these are
transactional messages a customer cannot opt out of, and offering to
unsubscribe from your own order confirmation is both wrong and confusing. If
marketing mail is ever added it will need that header — and a genuinely
separate sending domain, so a campaign complaint cannot take order
confirmations down with it.

## Warming up

A new IP that suddenly sends hundreds of messages looks exactly like a
compromised host. Real order volume ramps naturally, which is usually warm-up
enough — but do not import an old customer list and mail it on day one.

Watch the outbound queue for the first few weeks — the admin UI has it under
**Manage → Queues**, or from the shell:

```bash
docker compose -f docker-compose.mail.yml logs --tail=200 stalwart
```

A queue that grows rather than drains means mail is being deferred; the log
names the receiver and the reason it gave. Deferrals mentioning reputation or
rate limits are the ones to act on — the rest are usually a receiver being
briefly unavailable, and Stalwart retries on its own.

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
