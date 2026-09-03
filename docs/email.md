# Transactional email

Order confirmations, payment receipts, order status changes and stitching
updates, in English and Urdu, sent from our own mail server on the VPS.

## What runs, and what it reuses

One new Coolify resource. Nothing is duplicated.

| | |
|---|---|
| Mail server | **Stalwart** — SMTP, IMAP and JMAP in a single Rust binary |
| Metadata | the **existing Coolify Postgres**, in its own `stalwart` database |
| Rate limits, locks, ACME tokens | the **existing Coolify Redis**, on database index 1 |
| Message bodies | a local volume — deliberately *not* Postgres |
| Admin UI | routed by **Coolify's Traefik** at `mail.yaseen.pk` |

Stalwart was chosen over the two obvious alternatives for exactly this reason.
**mailcow** ships its own MariaDB and its own Redis and cannot be pointed at
existing ones. **DMS** (docker-mailserver) states outright that it uses "only
configuration files, no SQL database", so it cannot use the Postgres at all,
and it starts a second Redis of its own for Rspamd unless that is disabled and
Rspamd reconfigured by hand. Both would have put duplicate databases on the
box. mailcow also wants ~6 GB and DMS ~1 GB, against Stalwart's ~150 MB idle.

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

### 2. Collect the Coolify connection details

Coolify generates an internal hostname and credentials per database resource.
These must be read, not guessed. From the project's resource pages, or on the
host with `docker ps`:

- the Postgres resource's **internal hostname**, **port** and **superuser**
- the Postgres resource's **container name**, for running the init SQL
- the Redis resource's **internal hostname**

Everything below depends on these.

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

### 4. Give the mail server its own database

```bash
openssl rand -base64 32          # this becomes MAIL_DB_PASSWORD

docker exec -i <coolify-postgres-container> psql -U <coolify-pg-user> \
  -d postgres -v mail_password="'THE_PASSWORD_YOU_JUST_GENERATED'" \
  < deploy/mail/init-postgres.sql
```

Creates the `stalwart` role and database inside the Postgres already running.
Idempotent, so re-running after a partial setup is safe.

### 5. Add the mail resource in Coolify

Create a **Docker Compose** resource from `docker-compose.mail.yml`, in the
**same project and environment** as Postgres and Redis — that is what puts it
on the same network and lets it resolve them.

Set these environment variables on the resource:

| Variable | Value |
|---|---|
| `MAIL_DB_HOST` | the Postgres resource's internal hostname |
| `MAIL_DB_PORT` | usually `5432` |
| `MAIL_DB_PASSWORD` | the password from step 4 |
| `MAIL_REDIS_URL` | `redis://<redis-internal-host>:6379/1` |

Set the resource's domain to `mail.yaseen.pk` so Traefik routes and
certificates the admin UI. The compose file publishes 25, 465, 587, 143 and 993
on the host directly — SMTP and IMAP are not HTTP, so there is nothing for
Traefik to route there.

On first start Stalwart prints a one-time admin password to its log. Then apply
the storage settings from `deploy/mail/stalwart-config.toml`, either by merging
them into `/opt/stalwart/etc/config.toml` or in the admin UI under
**Settings → Storage**. Those are what point it at the existing Postgres and
Redis instead of its own embedded store.

### 6. Certificates

Stalwart serves SMTP and IMAP itself on 25/465/587/993 and needs a real
certificate **there**. Traefik only terminates TLS for HTTP, so routing the
admin UI through Coolify does not cover the mail ports.

**Move DNS to Cloudflare and let Stalwart use ACME DNS-01.** It needs no ports,
so it cannot collide with Traefik on 80/443, and nothing has to copy files
around. `yaseen.pk` is on `ns1/ns2/ns3.contabo.net` today, which expose no API —
that limitation is the *only* reason any certificate-copying is needed at all.
Cloudflare's DNS is free and the move is a nameserver change. Configure the
provider credentials in the admin UI under **Settings → Certificates**.

If DNS stays at Contabo, the fallback is to extract the certificate and key for
`mail.yaseen.pk` from Coolify's Traefik `acme.json` (they are base64 inside the
JSON; `jq` pulls them out), write them into the Stalwart volume, restart it, and
schedule that as a Coolify scheduled task. Then uncomment the
`[certificate."default"]` block in `deploy/mail/stalwart-config.toml`. It is
strictly worse — another moving part, and an expired certificate on 587 stops
the store sending mail entirely — so prefer DNS-01.

### 7. Create the mailboxes

In the admin UI at `https://mail.yaseen.pk`:

| Mailbox | For |
|---|---|
| `no-reply@yaseen.pk` | the store's SMTP account — the API signs in as this |
| `hello@yaseen.pk` | where customer replies land |
| `dmarc@yaseen.pk` | where the DMARC reports go |

Give `no-reply@` its own password. The API is a client like any other, not an
administrator.

### 8. Publish SPF, DKIM and DMARC

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

### 9. Point the API at it

Coolify holds environment variables in its UI, not in `.env.production`. On the
API resource:

```ini
NOTIFICATION_CHANNELS=log,email
SMTP_HOST=mail.yaseen.pk
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@yaseen.pk
SMTP_PASSWORD=<the password from step 7>
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

### 10. Check it, don't assume it

```bash
MAIL_FROM="Yaseen <no-reply@yaseen.pk>" pnpm check:email yaseen.pk YOUR_VPS_IP --selector=YOUR_DKIM_SELECTOR
```

Checks the A record, PTR, MX, SPF, DKIM, DMARC, From-domain alignment, three
blocklists and outbound port 25, and prints the fix for anything failing. It
exits non-zero on failures, so a Coolify scheduled task can run it and shout.

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

Note the MX already points at `mail.yaseen.pk`, so mail to the domain is being
directed at a host that is not yet answering. Anyone emailing `@yaseen.pk`
today gets a bounce or a timeout.

### 11. Test before you trust it

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
   autodiscover records in step 3 mean it configures itself.
3. **A webmail container.** SnappyMail is lightest and needs no database;
   Roundcube is the most battle-tested and runs on SQLite. Either is one
   container added in Coolify with the domain `webmail.yaseen.pk`.

## Backups

Coolify backs up its own managed databases on a schedule. Enable it on the
Postgres resource and the `stalwart` database is covered along with the shop's —
there is no second backup system to maintain, which is why `deploy/backup.sh`
deliberately does *not* know about mail.

**Message bodies are not in any database backup.** They live on the mail
resource's `stalwart-data` volume, deliberately, so a database dump does not
grow by the size of every attachment ever received. A full mail restore needs
the volume as well:

```bash
docker run --rm -v <mail-resource>_stalwart-data:/data -v "$PWD":/backup alpine:3 \
  tar czf /backup/stalwart-blobs-$(date -u +%Y%m%d).tar.gz -C /data .
```

Coolify prefixes volume names with the resource name — check `docker volume ls`
for the real one. Schedule it as a Coolify scheduled task if mailbox history
matters; the right cadence depends on how much mail is kept.

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
| `order.status_changed` | `order.status_changed` | Shipped or delivered. |
| `order.cancelled` | `order.status_changed` | An order is cancelled — its own event, not a status_changed transition; see the subscriber. |
| `payment.succeeded` | `payment.received` | A transfer or gateway payment clears. Skipped for cash on delivery. |
| `payment.failed` | `payment.failed` | A JazzCash/Easypaisa attempt is declined. Skipped for cash on delivery, which has no online attempt to fail. |
| `user.registered` | `user.welcome` | A new account is created. |
| `stitching.job_stage_changed` | `stitching.*` | The garment moves through the workshop. |

A returned order (`OrderStatusChanged` with `toStatus: RETURNED`) also emails
through `order.status_changed` — it just isn't its own row above because it
takes the same path as shipped/delivered.

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
