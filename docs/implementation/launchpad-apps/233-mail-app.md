# 233 — Mail app

> **Status: Planned.** Launchpad app (doc 232): tier **CORE**, audiences
> **INTERNAL, B2B**. Cross-sector, not industry-specific. Builds on doc 13
> (self-hosted, white-labelled email on Stalwart) and supersedes the
> shared-mailbox sketch in doc 231 §10.4, which this document makes concrete.
>
> **Source caveat.** The product idea came from a vendor's marketing page the
> owner pasted (Vyzno). Its claims were not verified and nothing here depends
> on them.

## 1. Objective and the one rule

A company gets professional mail on its own domain; **people sign in as
themselves** and see their personal mailbox plus every shared mailbox they are
assigned. **There is no shared password, anywhere.** The company owns the
mailboxes and their history; people hold assignments.

**Scope decision (agreed):** this app is a **control plane and UI over a mail
engine**, not a mail server written by us. Running SMTP/IMAP, spam filtering
and deliverability ourselves is the heaviest operational burden in the
catalogue, so the engine stays Stalwart (doc 13) behind an interface.

## 2. Existing state

* Doc 13: Stalwart (SMTP/IMAP/JMAP, spam filtering, DNS-record wizard), a
  webmail container, per-client `mail.clientdomain.com`, strict DNS (rDNS, SPF,
  DKIM, DMARC), a core `communications` transport reading `SMTP_URL`, and
  Stalwart's REST API for managing users/domains named as a future integration.
* Doc 161 (SSO) and doc 163 (personal API keys) exist for identity.
* Doc 36 (connector framework) is the pattern for talking to an outside engine.
* Nothing in `apps/api/src/modules/` models a mailbox, domain or mail member.

## 3. What the engine does and what we do

| Concern | Owner | Why |
|---|---|---|
| Receive/send/store mail, spam, DKIM signing, IMAP/JMAP | **Mail engine (Stalwart)** | proven, maintained software; we do not rebuild it |
| Domains, mailboxes, aliases, quotas as *business objects* | **This app** | the ERP knows who the people and company are |
| Who may open which mailbox | **This app → engine** | assignments live in PBAC terms, provisioned into the engine |
| Who sent each reply, as a fact | **This app** | attribution (doc 231 §2) |
| Webmail screen | embedded engine webmail via SSO, later a native screen | fastest path; replaceable |

**Resilience principle: the data plane survives the control plane.** If the
ERP is down, mail keeps flowing and people can still read it through the
engine's own login path; if the engine is down, the ERP keeps working and shows
"mail unavailable". The two failure domains are separate.

## 4. Model (additive, forward-only migration)

| Table | Key columns |
|---|---|
| `MailDomain` | `id`, `organizationId`, `name`, `status` (`PENDING_DNS` `VERIFIED` `ACTIVE` `SUSPENDED`), `dkimSelector`, `verifiedAt?` |
| `Mailbox` | `id`, `domainId`, `localPart`, `kind` (`PERSONAL` `SHARED`), `status`, `quotaBytes`, `engineRef`, unique `(domainId, localPart)` |
| `MailboxMember` | `mailboxId`, `userId`, `role` (`READ` `REPLY` `MANAGE`), `grantedBy`, `grantedAt`, `expiresAt?` |
| `MailAlias` | `mailboxId`, `address` |
| `MailSentRecord` | `id`, `mailboxId`, `messageRef`, `sentByUserId`, `sentAt`, `contributionId?` — one row per outgoing message, **written by the system with the authenticated sender** |
| `MailProvisionJob` | `id`, `kind`, `payload`, `status`, `attempts`, `lastError` — the outbox to the engine |

`Mailbox.engineRef` is the engine's own id, so a different engine can be swapped
in behind the same interface (Flexibility).

## 5. Behaviour

### 5.1 Setup (staff: *Mail → Domains*)
Add domain → show the **exact DNS records** the engine's wizard generates
(rDNS note, SPF, DKIM, DMARC) → verify by polling DNS → `ACTIVE`. Until verified,
the domain cannot send, and the screen says why. No step is hidden.

### 5.2 One person, many mailboxes
A user's mail view lists their `PERSONAL` mailbox plus every `SHARED` mailbox
where they hold a `MailboxMember` row. Roles: `READ` (view), `REPLY` (view +
send-as), `MANAGE` (also edit members — but see 5.5).

### 5.3 Shared mailboxes with no shared password
Members authenticate **as themselves** (SSO into webmail; per-user credentials
for IMAP/phone clients — §9 spike S2). Access is granted by creating a
`MailboxMember` row, which provisions a delegation in the engine; removing the
row revokes it. **No mailbox password is ever shown, shared or stored in the
ERP.**

### 5.4 Real-sender attribution (answers the false-credit problem)
When a member replies from `sales@`, the visible From is `sales@`, but the
system records `MailSentRecord.sentByUserId = <the person who pressed send>`
and emits `work.contribution_recorded` (doc 231 §2.3). Threads show
"Replied by Aisha" to members. A manager cannot reassign it; a claim goes
through the `CreditClaim` process.

### 5.5 Membership changes
Adding/removing a member needs `mail.members.manage`; every member is notified
(doc 231 §3.3). Changing the last `MANAGE` member is refused (a mailbox always
has at least one manager).

### 5.6 People leave — and privacy is not a casualty
* **Shared mailbox:** the leaver's `MailboxMember` rows are removed in the same
  transaction that deactivates the user (doc 21's "grant that ends itself");
  claimed threads return to the shared pool **unclaimed**, not to a manager.
* **Personal mailbox:** the company owns the history, so it is **kept**, but it
  becomes an **archive** readable only by a **named delegate approved by two
  people** (e.g. HR + owner), with every read logged and the reason recorded.
  It is **never auto-forwarded to the person's manager** — that would reproduce
  the manager-sees-everything problem doc 231 exists to prevent.
* Retention default **7 years** (jurisdiction-dependent; `Setting`, legal to
  confirm).

### 5.7 ERP links (later, optional)
Inbound mail from a known `Party` can attach to its support ticket, order or
booking. Out of the first release; the extension point is the existing
inbound-email handling, not a new pipeline.

## 6. Parameters (proposals to confirm)

| Parameter | Exact value | Why this number | Enforced | Degrades |
|---|---|---|---|---|
| DKIM key size | 2048-bit | Current baseline for deliverability; 1024 is deprecated by major receivers | engine, verified by app | Weaker key → domain stays `PENDING_DNS` |
| Default mailbox quota | 10 GiB personal, 25 GiB shared | Shared boxes accumulate attachments; sized to avoid early overflow without unbounded cost | engine + `quotaBytes` | At 90% warn members; at 100% reject with bounce |
| Max message size | 25 MiB | Matches the common receiver limit; larger bounces at the far end anyway | engine | Clear error, suggest a drive link |
| Outbound per mailbox, new domain (first 14 days) | 200 messages/day | New sending IPs/domains need warm-up or land in spam | engine rate rule | Over limit → queued to next day, shown |
| Outbound per mailbox, steady state | 2,000 messages/day | Normal business mail is far below; high volume is bulk mail and belongs in `marketing` | engine | Over limit → blocked + alert to `MANAGE` |
| Provision retry | 5 attempts, exponential 1 → 16 min | Engine restarts are minutes, not hours | `MailProvisionJob` | After 5 → *Mail problems* list, manual replay |
| Membership grant max lifetime if `expiresAt` set | 365 days | Contractor/temporary access should be renewed on purpose | service | Expired → revoked automatically |

All live in `Setting`, changed under `mail.settings.manage` with old/new audit.

## 7. Permissions

| Key | Grants | Seeded to |
|---|---|---|
| `mail.domains.manage` | add/verify/suspend domains | ADMIN |
| `mail.mailboxes.manage` | create/suspend mailboxes, quotas, aliases | ADMIN, IT |
| `mail.members.manage` | change mailbox members | mailbox `MANAGE` members' role + ADMIN |
| `mail.archive.read` | open a departed user's archive (two-person approval) | named delegates only |
| `mail.settings.manage` | limits, retention | ADMIN |
| `mail.use` | see the Mail app and own/assigned mailboxes | all staff |

Toxic pair refused: `mail.archive.read` + `mail.members.manage` in one role.

## 8. Failure modes and recovery

| Failure | Behaviour | Recovery |
|---|---|---|
| Engine down | mail still flows (engine is the data plane); ERP shows "unavailable" | auto-recover; provisioning queued |
| Provision call fails | `MailProvisionJob` retries; membership shows "pending" | *Mail problems* screen, **Replay** (idempotent by `(mailboxId, userId)`) |
| DNS wrong | domain stays `PENDING_DNS`, exact failing record shown | fix DNS, re-verify |
| User removed while a send is in flight | send completes, attribution already written | none needed |
| Deliverability drop (blacklist) | alert to `mail.domains.manage` holders with the failing check | manual; documented runbook |

## 9. Proof-of-concept gates — answer these BEFORE building

These are **unverified assumptions**, not facts. Each is a one-day spike against
the real engine.

| # | Question | If "no" |
|---|---|---|
| S1 | Does the engine support **shared/delegated mailboxes with per-user permissions** (JMAP sharing or IMAP ACL)? | Fall back to per-user forwarding rules + a shared-inbox UI in the ERP, losing native client support |
| S2 | Can a user open a **shared mailbox from a normal IMAP/mobile client using their own credentials**? | Offer webmail-only for shared boxes in v1 and say so |
| S3 | Can webmail sign in via **our SSO** (doc 161) with no separate password? | Per-user app passwords generated by the ERP |
| S4 | Does the engine's **management API** cover create/suspend/quota/alias/delegation idempotently? | Wrap with our own idempotency layer |
| S5 | Can the engine **report sender identity** per outgoing message (for `MailSentRecord`)? | Record at the submission hook in our relay |

The build does not start until S1–S3 have written answers in this document.

## 10. Out of scope

Chat and Drive (later; meetings doc 205 and `StorageService` exist); **sealed
mailboxes** (conflict with server-side search and spam filtering, deferred —
the sealed vault of doc 231/235 is the answer for confidential material);
bulk/marketing sending (`marketing` module); building our own SMTP/IMAP.

## 11. Scope lenses

**Actor with three tables** — staff → `User`+`Employee`; external correspondent → `Party`/`Contact` (later link); mailbox member → `User`.
**Principal with no permission key** — an engine-side IMAP client authenticates to the engine with per-user credentials, never to the ERP; the ERP's provisioning calls use a scoped service credential (`mail.engine` secret, `configuration.md`).
**Grant that ends itself** — §5.6 transaction; `expiresAt`.
**Whose rows / columns** — members see only assigned mailboxes; message bodies live in the engine, not our DB (we store `messageRef`, sender, time).
**Threshold nobody approves alone** — archive read needs two approvers; suspending a domain needs `mail.domains.manage` + second admin (it stops all company mail).
**Toxic pair** — §7. **Authority and blast radius** — domain suspension = company-wide mail stop; audited old/new.
**Audience is a capability** — alerts resolve from `mail.mailboxes.manage`/`MANAGE` members; zero holders → org owner; many → digest.
**Request or record** — a membership change is a request; a sent message is a record (never refused retroactively).
**Movement with no address / money / posting / period / second legal entity** — n/a: no stock or ledger. (Per-organization domains handle multiple legal entities.)
**Four hours down** — §8: mail continues on the engine.
**Dry run** — DNS verification and provisioning plan are pure/preview functions.
**Click the number** — mailbox usage links to the mailbox.
**Three silhouettes** — one domain/few mailboxes; many shared boxes; several organizations each with their own domain (`organizationId` from migration one).
**Absent collaborator** — no engine → app shows "not configured", nothing else breaks; no `work-credit` → `contributionId` null; no SSO → app passwords.
**Second copy of the write** — idempotent provisioning keys; `MailSentRecord` unique by `(mailboxId, messageRef)`.
**Hundred-thousandth row** — `MailSentRecord` grows per message: indexed `(mailboxId, sentAt)`, partitioned by month, no body stored.
**Adoption test** — ids random; addresses are unique per domain, not generated.
**Reversal document** — a removed member is a revoke row; nothing deleted.
**Undo fan-out** — membership revoke is automatic in engine; a sent message is deliberately irreversible.
**Version stamp** — retention/quota settings versioned.
**Erasure the ledger cannot obey** — `MailSentRecord.sentByUserId`, audit rows: pseudonymise after retention; message bodies live in the engine under its retention.
**Failure path** — §8.

## 12. Acceptance criteria

1. A user sees exactly their personal mailbox and the shared mailboxes they hold rows for (test).
2. No API, screen, log or audit row ever contains a mailbox password (test + grep in CI).
3. Removing a member revokes engine access within 60 s; re-adding restores it.
4. A reply from `sales@` writes a `MailSentRecord` with the actual sender; a manager cannot change it.
5. Deactivating a user returns their claimed shared threads unclaimed and converts their personal mailbox to an archive that needs two approvers to read.
6. With the engine stopped, the ERP stays usable and shows "mail unavailable".
7. S1–S3 are answered in writing before WO-233.2 starts.

## 13. Work orders

233.1 spikes S1–S5, results recorded here · 233.2 engine interface + `MailProvisionJob` · 233.3 domains + DNS verify · 233.4 mailboxes + members + SSO · 233.5 sent-record + contribution event · 233.6 departure transaction + archive · 233.7 Mail launchpad manifest, permissions seeded to real roles, nav entry.
