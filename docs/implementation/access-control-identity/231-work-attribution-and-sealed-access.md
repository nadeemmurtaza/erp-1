# 231 — Work attribution and sealed access

> **Status: Planned (design only; nothing built).** Cross-cutting **core**
> capability (not an industry pack): it applies to every sector deployment.
> Two problems, one principle — **what a person is credited with, and what a
> person can see, must come from evidence and explicit grants, never from
> someone's position in the hierarchy.**
>
> **Research note, stated plainly.** `vyzno.io` was named as a source but was
> **not readable** from this environment (blocked by the network proxy; web
> search found nothing). The owner later **pasted its marketing page text**;
> §10 compares against that text only. It is a vendor's own claims, not a
> tested product, and nothing in §§1–9 was derived from it. The design rests
> on the general sources in §9 and this repository's existing mechanisms.

---

## 1. The two problems, in the owner's words

1. **False credit.** A manager claims credit for work done by the person
   working under them.
2. **Sealed information.** Some confidential material should be known **only
   to the client and the developer** — not the boss, not the manager. Others
   must still be able to **review** without being handed passwords.

Both fail the same way in a typical system: access and credit flow **up the
org chart by default** (a manager sees everything under them and signs off on
it), and a **password is the unit of access** (whoever has the password *is*
the account, and nobody can tell who used it).

This repository already has pieces of the answer: `AuditService`, the
`approvals` core, PBAC with `TOXIC_PERMISSION_PAIRS` (docs 19–21), org-tree
grants (doc 21), personal API keys (doc 163), `StorageService`, and the
`configuration.md` rule that secrets are never committed. What is **missing**
is (a) a record of *who actually did the work* that a manager cannot write,
and (b) a compartment that the org chart cannot see into.

---

## 2. Problem 1 — false credit

### 2.1 Why it happens (root cause, not the symptom)

Credit is stored as **a field someone types** ("completed by", "owner",
"reported by") on an object that a manager can edit or approve. A mutable
claim beats evidence. The fix is not "trust managers less"; it is to make
**credit a derived fact with evidence behind it**, so a claim can be *checked*.

### 2.2 Principles

1. **Credit is derived from the actor's own authenticated actions, never typed
   in by someone else.** The system writes the contribution record when the
   doer acts. Nobody — manager, admin, or developer with DB access via the
   app — can create or edit a contribution *on another person's behalf*.
2. **Assignment is not authorship.** "Assigned to / owner" (who is
   responsible) and "contributed" (who did something) are different tables.
   A manager being the owner of a task does not make them its author.
3. **A manager's role is to *endorse*, and an endorsement is its own record**
   that sits *beside* the contribution and never replaces it.
4. **Contribution records are append-only and tamper-evident.** An edit is a
   new version with a reason; the old one stays visible to the doer.
5. **The doer can always see how they are credited**, without asking anyone.
6. **A dispute is never decided by the person disputed.** (Recusal rule.)
7. **Be honest about limits.** The system can prove what happened *in the
   system*; it cannot see work done outside it. Credit for leading, unblocking
   or reviewing is real and is modelled as roles, not hidden.

### 2.3 The mechanism

| Table | Key columns | Written by |
|---|---|---|
| `WorkContribution` | `id`, `subjectType`, `subjectId` (task, PR, document, ticket, order…), `actorUserId`, `kind` (`AUTHORED` `REVIEWED` `UNBLOCKED` `DIRECTED` `APPROVED` `TESTED` `DELIVERED`), `evidenceRef` (commit hash, document version id, transition id, file hash), `occurredAt`, `prevHash`, `hash` | **the system only**, inside the transaction of the act itself (a task transition, a file upload, a saved document version, a completed review) — `actorUserId` is always the authenticated caller |
| `CreditEndorsement` | `contributionId?`, `subjectId`, `endorserUserId`, `statement`, `at` | a manager or lead, explicitly, as an opinion |
| `CreditClaim` | `subjectId`, `claimantUserId`, `claimedKind`, `evidence`, `status` (`PENDING` `ACKNOWLEDGED` `DISPUTED` `RESOLVED`), `resolvedByUserId` | anyone claiming a role in work they did not themselves record |
| `CreditDispute` | `claimId`/`contributionId`, `raisedByUserId`, `reason`, `reviewerUserId`, `outcome` | the doer (or anyone named), decided by a **non-conflicted** reviewer |

* **Hash chain.** Each `WorkContribution` stores `hash = SHA-256(prevHash ‖
  canonical(row))` per subject (or per tenant day), so a retroactive edit
  invalidates every later hash. A daily **anchor** (the day's last hash)
  is written to `AuditService` and may be exported to external write-once
  storage by a deployment that wants that stronger guarantee. This is the
  hash-chain method named in the sources (§9), the cheapest tamper-evident
  option; the stronger options (signing, WORM storage) are
  optional extensions, not assumed.
* **Provenance for code.** For engineering work, the commit is the evidence:
  require **signed commits** on protected branches and store the commit hash
  as `evidenceRef`. An unsigned commit cannot carry credit.
* **Where contributions come from today.** Task transitions (doc 23), document
  versions, uploaded files, completed reviews, approvals (`approvals` core),
  support-ticket replies. Each of those services emits one
  `hospitality`-style past-tense event (`work.contribution_recorded`) through
  the outbox; the contribution table is a consumer, idempotent by
  `(subjectType, subjectId, actorUserId, kind, evidenceRef)`.

### 2.4 How a false claim fails

| Attempt | What happens |
|---|---|
| Manager marks the task "completed by me" | There is no such field to set. The task shows `AUTHORED: Aisha (commit 3f9c…, 14 Mar 16:02)`, `APPROVED: Manager (15 Mar)`. |
| Manager reassigns the task *after* it is done | The `AUTHORED` record is unchanged; the report shows "owner changed after completion" as a flagged event. |
| Manager files a `CreditClaim` for the work | Claim is `PENDING` and **shown to the doer**; credit does not change until the doer acknowledges or a non-conflicted reviewer rules. |
| Manager asks an admin to edit the record | There is no edit; there is a new versioned row with a reason, visible to the doer and to the reviewer, with the actor named. |
| Manager is also the assignee of the dispute | **Recusal**: the dispute router excludes anyone in the doer's reporting chain and anyone named in the claim; it routes to HR / a skip-level / the owner role. |
| Report built for leadership says "Team X delivered" | Every "delivered by" tile is a drill-down to the contribution rows; the tile shows **contributors**, not "owner". |

### 2.5 Reviews, bonuses, promotion

* Doc 26 (performance reviews) and doc 23 consume **contributions**, never a
  manager-typed claim alone. A review field that says "credited work" renders
  from `WorkContribution` and shows any open `CreditClaim` against it.
* **Discrepancy flag**: where the person credited in a summary is not the
  person whose actions produced the evidence, the summary is marked — "credit
  differs from evidence" — to the doer, the reviewer, and HR (not the credited
  person's chain).
* **Retaliation protection**: raising a dispute does not notify the disputed
  person's chain beyond what is needed; the doer's identity is shown only to
  the non-conflicted reviewer by default; the system records and flags any
  adverse action (reassignment, review change) on a person within a window
  (default 30 days) after a dispute, for HR.

### 2.6 Parameters

| Parameter | Exact value | Why this number | Enforced | Degrades |
|---|---|---|---|---|
| Claim acknowledgement window | 7 days | Long enough for leave/weekends; short enough that credit isn't left floating | `CreditClaim` sweeper | Past 7 days: escalates to reviewer, never auto-grants the claim |
| Dispute resolution target | 10 working days | Stated target, tracked as an SLA | reviewer queue | Breach → HR lead notified |
| Post-dispute adverse-action watch | 30 days | Covers a typical review cycle's next decision window | watcher | Flags only; never blocks |
| Hash anchor | once per day (23:59 org time) | One cheap write per day gives day-granularity tamper evidence | cron, idempotent | Missed → next run anchors both days; gap shown |

All in `Setting` with defaults above, edited under `work.settings.manage` with
a second signature and an audit row holding old and new value.

### 2.7 Permissions

| Key | Grants | Never given to |
|---|---|---|
| `work.contribution.view_own` | see own contributions | — (everyone) |
| `work.contribution.view_team` | see a team's contributions (read-only) | — |
| `work.endorse` | add an endorsement | cannot also resolve disputes on their own endorsements |
| `work.claim.create` | file a claim | — |
| `work.dispute.review` | rule on disputes (non-conflicted only) | anyone in the doer's chain (enforced by data, not by role name) |
| `work.settings.manage` | change windows, kinds | toxic pair with `work.dispute.review` |

There is deliberately **no** `work.contribution.edit` key. A permission that
does not exist cannot be granted by mistake. Each key is seeded through to a
real role (the catalogue-vs-roles trap named in `CLAUDE.md`).

### 2.8 Acceptance criteria

1. No API or screen can create a `WorkContribution` with `actorUserId` ≠ the authenticated caller (test, every writer).
2. Changing a task's owner after completion never changes its `AUTHORED` rows (test).
3. Altering any stored contribution row directly invalidates the chain at verification (test: tamper then `verifyChain()` fails at that row).
4. A `CreditClaim` by a manager on work authored by a report leaves credit unchanged until acknowledged or ruled.
5. A dispute's reviewer is never in the disputed person's reporting chain (test over a seeded org tree at three depths).
6. A summary whose credited person differs from the evidence is flagged to the doer.

---

## 3. Problem 2 — confidential information that the hierarchy must not reach

### 3.1 Why the usual setup fails

* **Org-tree access flows upward.** Doc 21 deliberately lets an office or
  department grant cover descendants. That is correct for operations and
  **wrong for secrets**: a manager "over" the developer would inherit sight of
  a client's confidential material.
* **A shared password proves nothing.** Everyone who has it is the same
  account; offboarding means rotating it for everybody; there is no record of
  who looked.
* **An admin can usually read everything**, including the secrets they only
  needed to *manage*.

### 3.2 Principles

1. **Need-to-know, by name — not by rank.** A sealed vault is readable only
   by the people listed as its **members**. Hierarchy, role and admin status
   grant nothing inside it.
2. **Can destroy, cannot read.** An admin may remove a vault (availability)
   but cannot decrypt it (confidentiality). Those are different powers.
3. **Use, don't reveal.** Where a secret exists to be *used* (a database
   password, an API key), the system injects it into the session or call and
   the human never sees it. Reviewers get *access*, not *credentials*.
4. **Access is delegated, scoped, time-boxed and revocable** — never "here is
   the password".
5. **Every view, use and grant is recorded**, and the vault's members are told
   when anything about membership changes.
6. **Emergency access is possible but loud**, and needs the people the secret
   belongs to — not the boss alone.
7. **Be honest about the trade-off.** Real confidentiality from administrators
   means the platform cannot recover a lost key by itself. That cost is named
   below with its mitigation, not hidden.

### 3.3 The sealed vault

| Table | Key columns |
|---|---|
| `SealedVault` | `id`, `projectId`/`subjectRef`, `name`, `status`, `createdByUserId`, `policyVersionId` |
| `VaultMember` | `vaultId`, `userId` **or** `externalPartyId`, `role` (`OWNER` `CONTRIBUTOR` `REVIEWER`), `wrappedKey` (the vault's data key encrypted to that member), `addedBy`, `addedAt`, `expiresAt?` |
| `VaultItem` | `vaultId`, `kind` (`SECRET`, `FILE`, `NOTE`, `CONNECTION`), `ciphertext`, `nonce`, `version`, `createdBy`, `masked` (display policy) |
| `VaultEvent` | append-only, hash-chained like §2.3: `view`, `use`, `grant`, `revoke`, `rotate`, `breakglass` |

* **Envelope encryption.** Each vault has a random **data key**; each item is
  encrypted with it (authenticated encryption, e.g. XChaCha20-Poly1305 or
  AES-256-GCM); the data key is stored **once per member, wrapped to that
  member's own key**. Anyone not listed has no wrapped key and therefore
  cannot decrypt — **including an admin and including the database
  operator.** This is the per-recipient-key approach in §9; the cryptographic
  primitive sits behind the existing pluggable-crypto direction of doc 126 so
  an algorithm can be rotated by a reviewed code change.
* **Where decryption happens.** Strongest mode: **in the member's browser or
  client** (zero-knowledge — the server stores only ciphertext). A deployment
  that cannot do client-side crypto uses a **KMS-held key bound to the member
  set**, which protects against a database leak but **not** against a
  malicious platform operator; the UI states which mode is in force (never
  claim zero-knowledge when it is not).
* **Membership changes need the owners.** Adding a member requires an existing
  `OWNER` (the client or the developer) to approve; the new wrapped key is
  created by an owner's client, so **an admin cannot add themselves**. Every
  member is notified of every change.
* **Recovery (the honest cost).** Because the platform cannot decrypt, a lost
  member key is not recoverable by support. Mitigation: a vault always has
  **at least two `OWNER`s** (client + developer) so either can re-wrap for a
  replacement; an optional **split-key recovery** (Shamir secret sharing, e.g.
  2-of-3 among client, developer and a named custodian) for deployments that
  want a last resort that still needs several people.

### 3.4 Review without passwords — four access patterns

| Pattern | For | How the password is avoided |
|---|---|---|
| **A. Scoped review link / invite** | an auditor, the boss, a third-party reviewer who needs to *see* the work | A `ReviewGrant` produces a signed, single-purpose token: **read-only**, limited to **named resources**, **expiring** (default 72 h), optionally single-use, watermarked with the viewer's identity, no export/download unless granted. The reviewer logs in as *themself* (or via a one-time email link) — they never receive a credential. |
| **B. Vault-brokered session** | working in a system that needs a login (server, DB, third-party dashboard) | The vault **opens the session for the user** (proxy/SSH/SQL/web) with the secret injected; the user never sees it; the session is time-boxed and logged. |
| **C. Ephemeral credentials** | a reviewer needs their *own* login on a system | The system **creates a temporary, least-privilege account or token** (read-only DB role, scoped OAuth/API token) that **expires on its own**, so nothing shared needs rotating afterward. |
| **D. Masked review mode** | reviewing a running app or staging environment | A "view as reviewer" mode renders data with **secrets masked** (`••••`) and connection strings redacted; nothing in the UI can reveal them. |

* **Scopes are the blast radius.** A grant lists resource, action
  (`READ` only by default), expiry, and optionally source IP/device. Broad
  scopes are refused unless an `OWNER` explicitly confirms the wording.
* **The boss can be a reviewer of the *work*, not a member of the *secret*.**
  The review link shows the deliverable (screens, reports, the diff, the demo
  environment in masked mode), never the sealed items. Reviewing a thing and
  holding its keys are different grants.
* **Ending itself.** Every grant has an `expiresAt`; revoke is one action by
  any `OWNER`; member removal rotates the data key (re-encrypts to remaining
  members) so a departed member's old copy is useless for **new** versions.
  (Honest limit: anything they already saw, they saw — that is why *use, don't
  reveal* is the default for the highest-value secrets.)

### 3.5 Break-glass (emergencies)

If both owners are unreachable and production is down: a `BreakGlassRequest`
needs **co-approval by the two roles the secret belongs to** (client and
developer owners; if only one is reachable, a named deputy set by them in
advance) — **not by management alone.** It is time-boxed (default 60 min),
**notifies every member immediately and loudly**, records conduct while
elevated (not just that elevation happened — the gap seen in the sources),
and forces a rotation of the touched secrets afterward.

### 3.6 Mapping to this repository

| Need | Reuse | New |
|---|---|---|
| Who may act | PBAC keys, `TOXIC_PERMISSION_PAIRS`, `approvals` core | `vault.*` keys below |
| Hierarchy must not reach | doc 21 org grants and `scopeFilterFor()` | an explicit **`sealed` exclusion**: queries touching `SealedVault`/`VaultItem` ignore org-tree grants entirely and filter by `VaultMember` only |
| Audit | `AuditService` | hash-chained `VaultEvent` |
| Files | `StorageService` (stores ciphertext only) | — |
| Crypto | doc 126 pluggable cryptography | key-wrap and AEAD interfaces |
| Tokens | doc 163 personal API keys / doc 34 `ApiClient` pattern | `ReviewGrant` token type, scoped and expiring |
| Secrets in the app itself | `configuration.md` (never in code or git) | the vault is for **people-level** secrets; deployment config stays env/secret-manager |

**Not a replacement for HashiCorp Vault–class infrastructure secrets.** This
vault is for **client-confidential project material and shared credentials
between people**. Runtime service secrets (DB URL, signing key) stay in the
deployment's secret manager.

### 3.7 Permissions

| Key | Grants |
|---|---|
| `vault.create` | create a sealed vault (becomes its first owner) |
| `vault.manage_members` | propose membership changes — takes effect only on owner approval |
| `vault.review_grant` | create review links/grants on vaults you **own** |
| `vault.destroy` | delete a vault — **held by admin, grants no read** |
| `vault.audit.view` | see `VaultEvent` for vaults you belong to |
| `vault.breakglass.request` | start an emergency request (never approves it) |

There is **no** `vault.read_all` key. Admin has `vault.destroy` and
`vault.audit.metadata` (who/when, never content). Toxic pairs refused:
`vault.destroy` + any member-management on the same vault by one person
without a second owner.

### 3.8 Parameters

| Parameter | Exact value | Why this number | Enforced | Degrades |
|---|---|---|---|---|
| Review link lifetime | 72 hours default, 30 days max | A reviewer typically finishes within a long weekend; a month is the longest legitimate engagement before re-grant | `ReviewGrant` | Expired → re-request by owner |
| Review link uses | unlimited reads within lifetime; **single-use** option for the highest-value items | Reviews are iterative; single-use is for one-time reveals | token store | — |
| Brokered/ephemeral session | 60 min default, 8 h max | One working session; 8 h is a working day | broker | Auto-close and revoke |
| Break-glass window | 60 min | Long enough to fix an outage, short enough to limit blast radius | `BreakGlassRequest` | Auto-revoke, forced rotation |
| Minimum owners per vault | 2 | One owner means one lost key = lost data | vault service | Cannot create/leave as last owner |
| Failed unlock attempts | 5 per 15 min per member, then 15 min lock | Slows guessing without locking out a real user for long | throttler | Lockout, alert to owners |
| Vault data key rotation | on any member removal; otherwise every 365 days | Removal must cut off future versions; annual rotation limits long-lived key exposure | vault service | Rotation job retried, reported on problems list |

All defaults live in `Setting`; changes are versioned, need a second owner's
signature, and record old and new value. These numbers are proposals to
confirm, not requirements already agreed.

### 3.9 Acceptance criteria

1. A user who is an org-tree ancestor of every vault member, and an ADMIN, **cannot** read any item (test: 0 plaintext, 0 wrapped key returned).
2. An admin cannot add themselves to a vault; the request waits for an owner and every member is notified.
3. A review link grants read access to exactly the named resources and nothing else; a request for another resource returns 403 (test).
4. Expired and revoked links return 401/403 within 5 s of expiry/revocation.
5. Removing a member rotates the data key; the removed member's old wrapped key cannot decrypt a post-removal item.
6. A break-glass elevation without both owner roles' approval cannot be created; with approval it auto-expires and records every read.
7. The UI states the active protection mode (client-side zero-knowledge vs KMS-bound) on the vault page.
8. No vault view, use, grant, revoke or break-glass event is missing from `VaultEvent`; tampering with a row fails chain verification.

---

## 4. How the two problems meet

The same **evidence-over-authority** idea governs both:

| | Credit | Confidentiality |
|---|---|---|
| Default the hierarchy would give | manager owns the result | manager sees everything below |
| What replaces it | contribution derived from the actor's own act | membership by name, per-member keys |
| What a manager *can* do | endorse, review the work | review the work via a scoped grant |
| What nobody can do | write another person's contribution | read a vault they are not in |
| Tamper evidence | hash-chained `WorkContribution` | hash-chained `VaultEvent` |
| Dispute / emergency | non-conflicted reviewer | owners co-approve break-glass |

The vault also **protects credit**: a developer's work product stored in a
sealed vault still creates `AUTHORED` contributions (the *fact* of authorship
is visible; the *content* is not), so a manager can see that Aisha did the
work without being able to open it.

---

## 5. Scope lenses (feature-scope map)

**The actor with three tables** — doer/manager/reviewer → `User`+`Employee`; the client and external reviewer → `Party` (client) + an `externalPartyId` on `VaultMember`/`ReviewGrant`; no new people table.
**The principal with no permission key** — a review-link holder authenticates by a scoped signed token via `ReviewGrantGuard`, reads only the granted `resourceIds`; a brokered session acts through the vault broker, never as a `User`.
**The grant that ends itself** — `ReviewGrant.expiresAt`, `VaultMember.expiresAt`, break-glass 60 min, ephemeral credential TTL; on user deactivation, the same transaction removes `VaultMember` rows, rotates affected data keys, and **re-queues pending claims/disputes to the role**, not silently to another person.
**Whose rows, and which columns** — vault rows filtered by `VaultMember` only (org-tree and admin scope ignored by design); `WorkContribution` visible: own always, team to `view_team` holders within their scope; ciphertext columns never returned except to a member's client.
**The threshold nobody approves alone** — adding a vault member needs an owner; a vault's last owner cannot leave; break-glass needs two owner roles; widening a review grant beyond `READ` needs an owner's confirmation; undo of each is a different authority (revoke by any owner).
**The toxic pair** — `work.settings.manage`+`work.dispute.review`; `vault.destroy`+member management without second owner; credit writer ≠ endorser on the same subject; enforced in `RolesService` and by actor-vs-stored-id compare.
**Authority and blast radius** — changing review-link or break-glass parameters needs a second owner signature; worst value is the 30-day/8-h ceiling; audit holds old and new.
**Audience is a capability** — vault-change and break-glass alerts resolve from membership (the vault's owners/members, not an address); credit disputes route to `work.dispute.review` holders outside the doer's chain; zero holders → escalate to the organization owner; many → one digest.
**Request or record** — a membership change, claim, or grant is a *request*; a contribution and a vault view are *records* (a view that happened is never refused retroactively; a variance is flagged).
**The movement with no address** — n/a: moves no stock or cash.
**Four hours down** — vault unavailable: reviewers cannot open links (fails closed, by design); owners keep their offline encrypted export (optional, owner-held); contributions made meanwhile are queued with an idempotency key and replay from the outbox.
**The unwritten posting rule** — n/a: writes no journal entry or money fact.
**Every column or none** — n/a for the ledger; contribution rows carry `organizationId` and project so cross-entity reports can scope.
**The period that already moved** — n/a (no fiscal period); late-arriving contributions are recorded with their true `occurredAt` and flagged as late.
**The second legal entity** — separate organizations have separate vaults, keys and chains; nothing is shared across entities.
**Dry run before live** — dispute routing is a pure function `route(dispute, orgTree)` that provably excludes the conflicted chain, replayable over past disputes with no write; review-grant scope preview shows exactly what a link will expose before issuing.
**Click the number** — every "credited to" figure drills to the contribution rows and evidence; the authoritative record is `WorkContribution`, any summary reconciles to it and flags deltas.
**Three silhouettes** — one freelancer-and-client pair (one vault, two owners), a 40-person agency (vault per client project), a group (vaults per entity); the columns exist from migration one but the Solo screen shows one list.
**The absent collaborator** — no `notify` → in-app alerts only; no `approvals` → owner approval is built into the vault flow; no client-side crypto available → KMS-bound mode with the weaker guarantee **stated in the UI**; no tasks module → contributions still from documents/files/reviews.
**The second copy of the write** — unique `(subjectType, subjectId, actorUserId, kind, evidenceRef)` for contributions; unique `(vaultId, eventKey)` for vault events; a retried grant returns the same grant.
**The hundred-thousandth row** — contributions and vault events reach tens of millions: partitioned by month, indexed `(actorUserId, occurredAt)` and `(subjectId)`; verification runs per subject chain, not over the whole table; list pages cursor-paged.
**The adoption test** — contribution and grant ids are random 128-bit values, safe for two nodes to mint offline; chain hashes are per subject so merges do not collide.
**The reversal document** — a wrong contribution is superseded by a new versioned row pointing to the original (never edited); a revoked grant is a `revoke` event pointing to the grant.
**The undo fan-out** — revoking a grant: token invalidation automatic; ephemeral credential deletion automatic (or flagged to a human if the target system is unreachable); key rotation automatic; data already viewed is deliberately irreversible and stated.
**The version stamp** — each contribution stores the `policyVersionId` under which `kind` was recorded; each vault stores its policy version; changing the rule later does not rewrite history.
**The erasure the ledger cannot obey** — names in `WorkContribution.actorUserId`, `VaultEvent`, `AuditLog.data`, `OutboxEvent.payload`: pseudonymise the user reference after the retention window (default 7 years for work records — an HR/legal matter to confirm per jurisdiction) while keeping the chain verifiable via salted-hash references; vault ciphertext is destroyed by `vault.destroy`.
**The failure path** — failed notifications, failed ephemeral-credential creation or revocation land on *Access problems* (permission `vault.audit.view` + `work.settings.manage` split by subject) with payload, error and a safe **Replay** (idempotent).

---

## 6. Work orders

| WO | Delivers | Needs |
|---|---|---|
| 231.1 | `WorkContribution` + hash chain + `verifyChain()` + event consumers for tasks/documents/reviews | — |
| 231.2 | Contribution views (own / team), "credited to" with drill-down, discrepancy flag | 231.1 |
| 231.3 | `CreditEndorsement`/`CreditClaim`/`CreditDispute` + recusal router + retaliation watch | 231.1 |
| 231.4 | Wire doc 26 reviews to read contributions | 231.2 |
| 231.5 | `SealedVault` schema, key-wrap/AEAD interfaces (doc 126), owner-approved membership | — |
| 231.6 | Vault UI (list, items, masked display, audit) + `VaultEvent` chain | 231.5 |
| 231.7 | `ReviewGrant` + guard + masked review mode | 231.5 |
| 231.8 | Vault-brokered sessions and ephemeral credentials (one provider each, behind interfaces) | 231.5 |
| 231.9 | Break-glass + rotation jobs | 231.5 |
| 231.10 | `sealed` exclusion in `scopeFilterFor()` (the org tree never reaches vaults) + toxic pairs + permission seeding to real roles | 231.5 |

Each ships whole: schema, service, controller, tests, the minimum UI, a
nav entry, and every permission seeded through to a role a real user holds.

## 7. Out of scope here

Monitoring staff (keystrokes, screenshots, "activity scores") — deliberately
excluded: this design proves *what was done in the system*, it does not
surveil people. Replacing deployment secret managers. A legal process for
disputes beyond the HR queue. Proof of work done entirely outside the system.

## 8. Decision to record

ADR (Proposed, to append): *credit as an append-only, system-written,
hash-chained contribution record that no one can write for another person;
sealed vaults with per-member wrapped keys that the org tree and admins cannot
read; delegated, scoped, expiring review grants instead of shared passwords.*

## 9. Sources (general)

* Secure sharing without exposing passwords — shared vaults with role-based access, just-in-time and time-limited access with approval, direct launch of sessions where the password is never revealed, expiring encrypted links for external parties: [Securden — shared password management](https://www.securden.com/password-manager/features/shared-password-management.html), [Bitwarden — secure password sharing for teams](https://bitwarden.com/resources/secure-password-sharing-for-teams/), [Psono — secure password sharing for teams](https://psono.com/blog/secure-password-sharing-for-teams).
* Zero-knowledge, client-side encryption where the server stores only opaque blobs: [secretli](https://github.com/pscheid92/secretli), [Akeyless — zero-knowledge encryption](https://www.akeyless.io/secrets-management-glossary/zero-knowledge-encryption/), [Client-side encryption (Wikipedia)](https://en.wikipedia.org/wiki/Client-side_encryption).
* Splitting a key among several people: [Shamir's secret sharing](https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing).
* Break-glass design and the gap where conduct while elevated goes unaudited: [BeyondTrust — break glass process](https://www.beyondtrust.com/blog/entry/provide-security-privileged-accounts-with-break-glass-process), [Anchor Defense — break-glass access controls](https://anchor-defense.com/articles/break-glass-access-federal-iam/).
* Scoped, short-lived delegated access in place of password sharing (OAuth, token exchange): [Frontegg — OAuth explained](https://frontegg.com/blog/oauth), [Oasis — OAuth 2.0](https://www.oasis.security/glossary/oauth-2-0).
* Tamper-evident trails and signed commits for attribution (hash chains, signatures, WORM): [Finqub — tamper-evident audit logs](https://finqub.io/learn/tamper-evident-audit-trail/), [Insight42 — signed commits](https://insight42.com/code-signing-signed-commits-prevent-git-impersonation-and-meet-us-eu-compliance-nis2-gdpr-cra/), [Kusari — non-repudiation](https://www.kusari.dev/learning-center/non-repudiation).

*Limits of this research:* Bitwarden's page was blocked from direct reading,
so its claims here come from search summaries only. The sources are general industry practice; they are not a
review of any specific competing product.

---

## 10. Comparison with Vyzno (from the owner's pasted page text)

**Source and limits.** Only the text the owner pasted: a marketing page for
"Vyzno Mail" (company-owned email, shared mailboxes, plus chat and files). No
architecture, security model, pricing or independent review was available, so
every "Vyzno does X" below means "its page says X". Nothing was tested.

### 10.1 What the page claims

| Claim on the page | Plain meaning |
|---|---|
| "No shared passwords — give access without sharing logins" | A shared mailbox (e.g. `sales@`) is assigned to people; each signs in as themselves |
| "Change access anytime — add or remove people" | Access is an assignment that can be changed without rotating a password |
| "One person, multiple mailboxes" | One login shows the personal mailbox plus every shared one assigned |
| "Mail history stays with the company" / "People leave, company email stays" | The **organization owns** the mailbox; removing a person does not take the mail with them |
| Mail + Chat + Drive in one workspace | Bundled workspace; no detail given |
| Setup: add domain → create mailboxes → assign people → work together | Admin-driven onboarding |

### 10.2 What it confirms in this design

* **The resource belongs to the organization; people get assignments.** That is
  the same shape as §3's vault (`VaultMember` rows, no shared secret) and as
  §3.4 pattern A/B (access without a handed-over password). Their page shows
  the pattern is a recognised market expectation for *shared mailboxes*, not
  only for secrets.
* **"People leave, the thing stays"** matches the "grant that ends itself"
  lens: removal is a membership change, not a credential rotation for
  everyone.

### 10.3 Where Vyzno's model and this document deliberately differ

| | Vyzno page's model | This document |
|---|---|---|
| Who controls access | **The company** — admins assign and remove; "company control" is the selling point | For sealed material, **the owners (client + developer), not the company's admins or management** |
| Can a manager/admin read everything? | Implied yes: "communication under company control", history owned by the company | **No** inside a sealed vault (§3.1–3.3): admins can destroy, not read |
| Who did the work | Not addressed on the page | **Per-person attribution** (§2) |

**This is the key finding.** A company-owned, admin-assigned mailbox solves
the *shared-password* problem and the *departing-employee* problem. It does
**not** solve either of your two problems:

1. **Confidential from the boss.** A company-controlled mailbox is, by design,
   readable by whoever controls the company. Client-and-developer-only
   material cannot live in one. It belongs in a sealed vault (§3), and the
   *review* of it uses scoped grants (§3.4), not mailbox assignment.
2. **False credit.** A shared mailbox makes attribution *worse* unless each
   reply is tied to a person: if three people answer from `sales@`, "who
   handled it" is exactly the field a manager can claim. The fix is the same
   as §2: record the **actual sender** (the signed-in person) on every
   outgoing message and contribution (`AUTHORED`/`REVIEWED`), even when the
   visible From address is the shared one.

### 10.4 What is worth adopting for this ERP (core, cross-sector)

If a shared-mailbox capability is built, it should follow these rules, which
take Vyzno's good idea and close the two gaps above:

1. **Sign in as yourself, never to a shared login.** A `SharedMailbox` has
   `MailboxMember` rows (person, role: `READ` `REPLY` `MANAGE`, `expiresAt?`);
   there is no mailbox password to hand over.
2. **Send-as, with the real sender recorded.** Outgoing mail from a shared
   address stores `sentByUserId` on the message and emits a
   `work.contribution_recorded` event — attribution survives the shared address.
3. **The organization owns the mailbox and its history** (departure does not
   delete it), **but** a mailbox flagged `SEALED` follows §3: membership by
   named owners, per-member keys, admins cannot read; `SEALED` is opt-in
   because it costs server-side search and recovery (the §3.3 trade-off).
4. **Membership changes are audited and notified** to the members, as in §3.3.
5. **Reassignment on departure** happens in the same transaction that
   deactivates the user (doc 21's grant-ends-itself rule): the person's
   mailbox memberships are removed, open threads return to the shared pool
   unclaimed, nothing is silently handed to a manager.
6. **Reuse before building.** Doc 13 (self-hosted, white-labelled email) and
   the inbound-email handling already in the repository are the starting point;
   this would be an extension of that, not a second mail system. Whether
   mail, chat and drive should be bundled the way the page does is a product
   decision with no support in this repository's current scope.

### 10.5 Open questions for the owner

1. Is the goal an email product (like Vyzno) inside this ERP, or only the
   *access pattern* (no shared passwords, assign-and-revoke) applied to the
   things the ERP already holds? Docs 231 §§1–9 assume the second.
2. Should `SEALED` mailboxes exist at all, given they disable admin recovery
   and server-side search for that mailbox?
3. Is "company owns the history" acceptable for **non-sealed** mailboxes, with
   the sealed vault reserved for client-confidential material? (This document
   assumes yes.)

### 10.6 Work orders

> **Superseded:** the owner approved a Mail app inside a launchpad. The concrete
> design, with proof-of-concept gates, is
> [`../launchpad-apps/233-mail-app.md`](../launchpad-apps/233-mail-app.md); the
> list below is kept for history.


231.11 `SharedMailbox`/`MailboxMember` over doc 13's mail path · 231.12
`sentByUserId` + contribution event on send · 231.13 departure transaction
(memberships removed, threads returned to pool) · 231.14 optional `SEALED`
mailbox mode reusing §3's key-wrap.

Source for §10: text pasted by the owner from the vendor's own website; not
independently verified.
