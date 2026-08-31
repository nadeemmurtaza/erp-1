# Transactional email

Order confirmations, payment receipts, order status changes and stitching
updates, in English and Urdu, sent from our own mail server on the VPS.

## What runs, and what it reuses

One new Coolify project. Self-contained — no shared databases.

| | |
|---|---|
| Mail server | **Mailcow** — Postfix + Dovecot + Rspamd + ClamAV + SOGo |
| Database | **MariaDB** — ships inside Mailcow, not the store's Postgres |
| Cache | **Redis** — ships inside Mailcow, not the store's Redis |
| Antispam | **Rspamd** — Bayesian filtering, fuzzy hashing, community rulesets |
| Antivirus | **ClamAV** — scans all inbound mail for malware |
| Webmail | **SOGo** — webmail + calendar + contacts at `mail.yaseen.pk` |
| Admin UI | **Mailcow** — at `https://mail.yaseen.pk` |
| Message bodies | local Docker volumes |

Mailcow was chosen for three reasons:

1. **Complete out of the box.** Rspamd antispam, ClamAV antivirus, SOGo
   webmail, admin UI — everything included. No separate SnappyMail or
   Roundcube container needed.
2. **Battle-tested.** Postfix (1998) and Dovecot (2002) have 20+ years of
   production history. Mailcow wraps them in a well-maintained Docker stack
   with 15k+ GitHub stars and a large community.
3. **Resource-appropriate.** Uses ~4-6 GB RAM on a 12 GB VPS. Leaves 6-8 GB
   for the store — more than enough.

Two deliberate separations:

- **Its own stack, not sharing the store's.** Mailcow ships MariaDB and Redis.
  Sharing databases would create coupling — a Mailcow update could break the
  store, and vice versa.
- **Its own Coolify project.** Deployed separately so resource limits,
  backups, and updates are independent.

## Read this first

Self-hosting outbound mail is free and gives up nothing to a vendor, but it is
the one part of this stack where doing everything right still is not always
enough. Gmail — where most customers are — decides whether to accept mail from
a brand-new server IP largely on reputation it has not yet formed.

Three things are not optional, and all three live outside this repository:

1. **Outbound port 25 must be open.** Many VPS providers block it by default.
   Unblocking is a support ticket. **Check this before anything else** — if
   port 25 is blocked, self-hosting cannot deliver at all.
2. **A PTR record** on the VPS IP pointing at `mail.yaseen.pk`, set in Contabo's
   control panel rather than in DNS hosting. Receivers check that the forward
   and reverse records agree and reject when they do not.
3. **SPF, DKIM and DMARC** published for `yaseen.pk`. Since February 2024 Gmail
   and Yahoo have required all three from bulk senders.

If the provider will not open port 25, use a relay instead — see
[Switching to a relay](#switching-to-a-relay). No application code changes
either way; that is why the transport is plain SMTP.

## Setup

### 1. Check port 25 before you build anything

From the VPS:

```bash
nc -zv gmail-smtp-in.l.google.com 25
```

A connection means you are clear. A hang or refusal means Contabo is blocking
it — raise a ticket, and do not continue until it succeeds.

### 2. Clone and configure Mailcow

```bash
cd /opt
git clone https://github.com/mailcow/mailcow-dockerized.git
cd mailcow-dockerized
./generate_config.sh
```

The script asks two questions:

- **Mail server hostname:** `mail.yaseen.pk`
- **Timezone:** `Asia/Karachi`

This creates `mailcow.conf`. Edit it before deploying:

```bash
nano mailcow.conf
```

Key settings to verify:

```bash
MAILCOW_HOSTNAME=mail.yaseen.pk
TZ=Asia/Karachi
SKIP_CLAMD=n            # set to y if you want to save ~1 GB RAM
SKIP_SOLR=y             # set to y unless you need full-text search
HTTP_PORT=80
HTTPS_PORT=443
HTTP_BIND=0.0.0.0
HTTPS_BIND=0.0.0.0
```

### 3. Point DNS at the server

| Type | Name | Value |
|---|---|---|
| A | `mail.yaseen.pk` | the VPS IP |
| MX | `yaseen.pk` | `mail.yaseen.pk` priority 10 |
| PTR | (VPS IP) | `mail.yaseen.pk` — in **Contabo's panel**, not DNS |
| CNAME | `autodiscover.yaseen.pk` | `mail.yaseen.pk` |
| CNAME | `autoconfig.yaseen.pk` | `mail.yaseen.pk` |

The A and MX records already exist and are correct. The PTR is currently a
generic Contabo hostname and must be changed.

### 4. Deploy via Coolify

Create a **new Coolify project** called `mail` (separate from the store project).

Add a **Docker Compose** resource using `docker-compose.mail.yml`. Mount
`mailcow.conf` from the VPS (`/opt/mailcow-dockerized/mailcow.conf`).

On first start, Mailcow generates DKIM keys and prints an admin password.
Access the admin UI at `https://mail.yaseen.pk` to manage domains, mailboxes,
and DKIM.

### 5. Create the mailboxes

In the admin UI at `https://mail.yaseen.pk`:

| Mailbox | For |
|---|---|
| `no-reply@yaseen.pk` | the store's SMTP account — the API signs in as this |
| `hello@yaseen.pk` | where customer replies land |
| `dmarc@yaseen.pk` | where the DMARC reports go |

Give `no-reply@` its own password. The API is a client like any other, not an
administrator.

### 6. Publish SPF, DKIM and DMARC

Generate the DKIM key in the Mailcow admin UI under **ARC → Keys**, then publish:

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

### 7. Point the API at it

Coolify holds environment variables in its UI, not in `.env.production`. On the
API resource:

```ini
NOTIFICATION_CHANNELS=log,email
SMTP_HOST=mail.yaseen.pk
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@yaseen.pk
SMTP_PASSWORD=<the password from step 5>
MAIL_FROM=Yaseen <no-reply@yaseen.pk>
MAIL_REPLY_TO=hello@yaseen.pk
STORE_NAME=Yaseen
STOREFRONT_URL=https://yaseen.pk
SUPPORT_WHATSAPP=+92 321 1110813
BANK_TRANSFER_DETAILS=Meezan Bank — Yaseen
IBAN: PK00 MEZN 0000 0000 0000 0000
Account title: Yaseen
```

`SMTP_HOST` has to match the name on the certificate or TLS verification fails.
`mail.yaseen.pk` resolves publicly and matches, at the cost of a hairpin out and
back; if you would rather keep it on the internal network, add `mail.yaseen.pk`
as a network alias for the mail container so the name resolves internally and
the certificate still matches. **The fix for a hostname mismatch is never to
turn verification off.**

Keeping `log` alongside `email` means every message stays visible in the API
log, which is where you look when a customer says nothing arrived.

The API refuses to boot if `email` is listed without an `SMTP_HOST`, so a
half-finished deploy fails loudly instead of quietly dropping confirmations.

### 8. Check it, don't assume it

```bash
MAIL_FROM="Yaseen <no-reply@yaseen.pk>" pnpm check:email yaseen.pk YOUR_VPS_IP --selector=YOUR_DKIM_SELECTOR
```

Checks the A record, PTR, MX, SPF, DKIM, DMARC, From-domain alignment, three
blocklists and outbound port 25, and prints the fix for anything failing. It
exits non-zero on failures, so a Coolify scheduled task can run it and shout.

**Run it from the VPS.** Port 25 and the blocklist lookups only tell the truth
from the machine that actually sends.

### 9. Test before you trust it

Send a real order to <https://www.mail-tester.com>, which scores the message
out of 10 and names anything missing. Below 8 means something above is wrong.

Then send one to a Gmail address and use **Show original**. You want:

```
SPF:   PASS
DKIM:  PASS
DMARC: PASS
```

## Reading the mail

Mailcow includes **SOGo** — a full webmail client with calendar and contacts,
at `https://mail.yaseen.pk`. Every mailbox created in the admin UI is
automatically available in SOGo.

For team mailboxes (e.g., `support@yaseen.pk`, `sales@yaseen.pk`), each
employee logs in with their own credentials at the same URL. No extra
containers needed.

Additional access methods:

1. **Any IMAP client.** Thunderbird, Apple Mail, the Gmail app. The
   autodiscover records in step 3 mean it configures itself.
2. **CalDAV/CardDAV.** SOGo supports calendar and contacts sync with
   Apple Calendar, Thunderbird, and DAVx⁵ (Android).

## Backups

Mailcow stores everything in Docker volumes. Back up these volumes:

```bash
docker run --rm \
  -v mailcow-vol-redis:/redis \
  -v mailcow-vol-vmail:/vmail \
  -v mailcow-vol-clamd:/clamd \
  -v mailcow-vol-sogo:/sogo \
  -v mailcow-vol-rspamd:/rspamd \
  -v "$PWD":/backup \
  alpine:3 \
  tar czf /backup/mailcow-$(date -u +%Y%m%d).tar.gz \
    -C /redis . -C / vmail -C / clamd -C / sogo -C / rspamd
```

Check `docker volume ls` for the real volume names — Coolify prefixes them
with the resource name. Schedule as a Coolify scheduled task.

For MariaDB (mailboxes, aliases, domains):

```bash
docker exec -i <mailcow-mariadb-container> \
  mysqldump -u mailcow -p"$MAILCOW_DB_PASS" mailcow > /backup/mailcow-db.sql
```

## Staying out of spam

Authentication makes you *eligible* for the inbox. Reputation decides the rest,
and a brand-new VPS address has none — so the early weeks are the fragile part,
not the configuration.

What the code already does, so it does not have to be remembered:

- **Every message has a plain-text part** alongside the HTML. HTML-only mail
  scores worse, and a young sender cannot spare the points.
- **The envelope sender is pinned** to the same domain as the visible `From`,
  so SPF is checked against the domain DMARC will compare against.
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

Watch the outbound queue for the first few weeks — in the Mailcow admin UI
under **Queue**, or from the shell:

```bash
docker compose -f docker-compose.mail.yml logs --tail=200 postfix-mailcow
```

A queue that grows rather than drains means mail is being deferred; the log
names the receiver and the reason it gave. Deferrals mentioning reputation or
rate limits are the ones to act on — the rest are usually a receiver being
briefly unavailable, and Postfix retries on its own.

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

## Multi-client agency architecture

One Mailcow instance serves unlimited client domains. Each client domain is
added in the admin UI — no new containers, no new ports.

| Resource | Per-client cost |
|---|---|
| Domain setup in admin UI | 2 minutes of your time |
| Mailboxes | Unlimited, zero cost |
| SOGo webmail | Shared, zero cost |
| Antispam/antivirus | Shared, zero cost |

### Adding a new client domain

1. Get the client's DNS access (or guide them through it)
2. Add the domain in Mailcow admin UI
3. Publish SPF, DKIM, DMARC records at their DNS provider
4. Set PTR at your VPS provider (one PTR covers all domains on the IP)
5. Create mailboxes (`support@client.com`, `hello@client.com`, etc.)
6. Point their app's SMTP env vars at `mail.yaseen.pk`

### Per-domain outbound routing

Mailcow supports per-domain transport maps. If a client wants their mail
sent through their own relay (e.g., their own SendGrid), configure it in
**Configuration → Mailbox → Domain → Transport** without affecting other
domains.

### White-label webmail

Each client accesses `mail.clientdomain.com` → SOGo. The SOGo interface
shows the client's domain, not yours. From the client's perspective, they
have their own mail system.
