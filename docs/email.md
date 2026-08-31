# Email

## Overview

Transaction email is sent through an SMTP relay — currently a self-hosted
[Stalwart](https://stalw.art/) mail server on the same VPS. The API speaks
plain SMTP (nodemailer) and does not care what serves it. Switching to a
different relay (Cloudflare, SES, Resend) is four environment variables.

The mail server is deployed as a separate Coolify project (`mail`) with
Stalwart (mail server) and SnappyMail (webmail). It stores mail independently
of the store's PostgreSQL database.

## Architecture

```
API (yaseen project)          Mail (mail project)
├── email.channel.ts          ├── Stalwart (SMTP/IMAP, host network)
│   ↓ SMTP :587               │   ├── Port 25 (inbound)
│   ↓ (Docker gateway)        │   ├── Port 465/587 (submission)
└── PostgreSQL                │   └── Port 993 (IMAP)
                              └── SnappyMail (:8888)
                                  └── Caddy → mail.*.com
```

The API sends to Stalwart via SMTP on the Docker gateway IP (usually
`172.18.0.1:587`). Stalwart is on `network_mode: host` so outbound mail
uses the VPS's real IP, matching the SPF record.

## Setup

### 1. Deploy Stalwart + SnappyMail

In Coolify, create a new project called `mail` and add a Docker Compose
resource pointing at `docker-compose.mail.yml` from this repo.

Alternatively, on the VPS:

```bash
docker compose -f docker-compose.mail.yml up -d
```

### 2. Stalwart Setup Wizard

1. Open `http://YOUR_VPS_IP:8080/admin`
2. Server hostname: `mail.yaseen.pk`
3. Default domain: `yaseen.pk`
4. Enable automatic TLS certificate (Let's Encrypt)
5. Enable DKIM key generation
6. Storage: RocksDB (default)
7. Complete the wizard

Retrieve the bootstrap admin password from logs:

```bash
docker logs mail-stalwart 2>&1 | grep -A8 'bootstrap mode'
```

### 3. Add Your Domain

In Stalwart admin → **Management → Domains** → Add `yaseen.pk`.

Stalwart generates DKIM keys and shows the DNS records you need to publish.

### 4. Publish DNS Records

Add these to your DNS provider (Cloudflare recommended for free plan):

```
; MX — incoming mail
MX  10  mail.yaseen.pk.

; A — mail server
A  mail.yaseen.pk.  <YOUR_VPS_IP>

; SPF
TXT  yaseen.pk.  "v=spf1 ip4:<YOUR_VPS_IP> -all"

; DKIM (copy from Stalwart admin)
TXT  202404e._domainkey.yaseen.pk.  "v=DKIM1; k=ed25519; h=sha256; p=..."
TXT  202404r._domainkey.yaseen.pk.  "v=DKIM1; k=rsa; h=sha256; p=..."

; DMARC (start with none — monitor first)
TXT  _dmarc.yaseen.pk.  "v=DMARC1; p=none; rua=mailto:dmarc@yaseen.pk"
```

### 5. Create Mailboxes

In Stalwart admin → **Management → Accounts** → Create accounts:

- `admin@yaseen.pk` — admin
- `hello@yaseen.pk` — customer-facing
- `noreply@yaseen.pk` — transactional (order confirmations)

### 6. Configure Webmail

In SnappyMail admin (`http://VPS_IP:8888/?admin`):

1. Domains → Add `yaseen.pk`
2. IMAP: `mail.yaseen.pk:993` (SSL)
3. SMTP: `mail.yaseen.pk:587` (STARTTLS)

### 7. Add Caddy Route

Add to your Caddyfile:

```
mail.yaseen.pk {
    reverse_proxy localhost:8888
}
```

### 8. Configure the API

Set in Coolify on the API resource:

```
NOTIFICATION_CHANNELS=log,email
SMTP_HOST=172.18.0.1
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<stalwart admin email>
SMTP_PASSWORD=<stalwart password>
MAIL_FROM=Yaseen <no-reply@yaseen.pk>
MAIL_REPLY_TO=hello@yaseen.pk
```

### 9. Verify

```bash
pnpm check:email yaseen.pk
```

Then send a test email and check with [mail-tester.com](https://www.mail-tester.com).

## Adding Client Domains

The mail server handles unlimited domains. For each new client:

1. **Stalwart admin** → Add domain → `client1.com`
2. **Copy DNS records** from Stalwart admin
3. **Client publishes DNS** (MX, SPF, DKIM, DMARC pointing at your VPS IP)
4. **Create mailboxes** → `sales@client1.com`, `support@client1.com`, etc.
5. **SnappyMail admin** → Add domain with client branding
6. **Caddy** → Add `mail.client1.com { reverse_proxy localhost:8888 }`
7. **Verify** → `pnpm check:email client1.com`

No Coolify changes needed. No container restarts.

## IP Warm-Up

A new IP needs warm-up to build reputation with Gmail, Outlook, etc.

| Week | Emails/Day | Target |
|---|---|---|
| 1 | 20-50 | Your own Gmail/Outlook accounts |
| 2 | 50-100 | Existing customers |
| 3 | 100-200 | All transactional |
| 4 | 200-500 | Full volume |
| 5+ | Unlimited | All traffic |

**Rules:**
- Never increase by more than 50% per day
- Send to engaged recipients first
- Monitor Google Postmaster Tools daily
- Check MXToolbox blacklist weekly

## DMARC Progression

| Timeline | Policy | Command |
|---|---|---|
| Week 1-4 | `p=none` | Monitor only, collect reports |
| Month 2 | `p=quarantine; pct=25` | Quarantine 25% of failing mail |
| Month 3 | `p=quarantine; pct=100` | Quarantine all failing mail |
| Month 4+ | `p=reject` | Reject unauthenticated mail |

Update the `_dmarc` TXT record at each stage.

## Staying out of Spam

- **SPF**: Authorize only your VPS IP. Use `-all` (hard fail).
- **DKIM**: Stalwart signs every outbound message. Keys rotate automatically.
- **DMARC**: Start permissive, tighten over time.
- **TLS**: Stalwart enforces TLS 1.2+ for all connections.
- **Reputation**: Warm up slowly. Monitor. Never spike.
- **Content**: Keep subject lines honest. Avoid spammy words.
- **Unsubscribe**: For marketing lists, include `List-Unsubscribe` headers.

## How It Works

The `NotificationChannel` interface (`notification-channel.ts`) defines three
methods: `name`, `supports()`, and `send()`. The `NotificationsService` fans
out to every enabled channel. A failing channel is logged and skipped — a
dead SMTP server must never stop an order from being placed.

Adding a new channel (WhatsApp, SMS) is a new class implementing the interface
plus an entry in `NOTIFICATION_CHANNELS` — no caller changes.

## Language

Email body is in the recipient's locale — English or Urdu. The notification
system sets the subject and body before passing the message to channels, so
email always receives correctly localized content.

## Duplicates

The transactional outbox (`outbox.dispatcher.ts`) guarantees each event is
processed exactly once. Notifications are published through the outbox, so
duplicate emails are structurally impossible under normal operation.

## Self-Hosted Fallback

If you ever need to move away from Stalwart, the email channel works with
any SMTP relay. Just change four environment variables:

```
SMTP_HOST=<new-relay-host>
SMTP_PORT=<new-port>
SMTP_SECURE=<true|false>
SMTP_PASSWORD=<new-credentials>
```

No code changes needed.
