# 193 — The partner nobody has published an app for: private connections stay, beside the directory, never replaced by it

> **Status: proposed, not yet built — and so is most of what it keeps.** The
> private mechanisms this document preserves are specified but unbuilt: doc
> 36 `OutboundConnector`, doc 132 `InboundWebhookEndpoint`, doc 160
> `OAuthConnection`/`PollConnector`/`ExternalRecordLink`, doc 162
> `FileConnector`, all of which doc 172 plans to build as the `connectors`
> module. The one new piece here — doc 34's `SERVICE_ACCOUNT` kind of
> `ApiClient` — is doc 189's model. Doc 163's personal keys **are** built.
> Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program (ADR-073).

## 1. The promise

A tenant is **never** blocked because nobody has published an app for the
system it needs to connect to. Its own ERP, a regional bank, a local
courier or a client's in-house tool gets a private connection that the
tenant's own admin configures, with no directory, no review and no
publisher. Doc 36 opened with the rule that makes this work: "write a typed
interface once a real, repeated need exists; use the generic connector for
everything else". The directory is the "real, repeated need" end of that
spectrum — a vendor serving many tenants. The generic connector is
everything else, and it stays.

## 2. Two directions, and the mechanism for each

| Direction | Mechanism | Specified in | What the tenant configures |
|---|---|---|---|
| **NEWAX → the partner** (push our events) | `OutboundConnector` — URL, auth method, subscribed events, `payloadTemplate` | Doc 36 | Where, how to authenticate, which events, what shape |
| NEWAX → the partner, OAuth "Connect your account" | `OAUTH2_AUTHORIZATION_CODE` + `OAuthConnection` | Doc 160 §1 | A click-through to the partner's own consent |
| NEWAX ← the partner, on a schedule (pull theirs) | `PollConnector` + `ExternalRecordLink` | Doc 160 §2–3 | Source URL, template, interval |
| NEWAX ← files | `FileConnector` (SFTP; MT940/CAMT.053/CSV/fixed-width) | Doc 162 | Host, format, schedule |
| **The partner → NEWAX, pushing in its own format** | `InboundWebhookEndpoint` (mapped onto an existing domain event) | Doc 132 | Verification method, template |
| **The partner → NEWAX, calling our API** | **`ApiClient` of kind `SERVICE_ACCOUNT`** — the "private app" | Doc 34, completed in doc 189 | A name, a permission grant, a token |
| One person's own script or agent | A personal key (`nxa_…`) | Doc 163 — built | The person's own subset of their own access |

**Outbound delivery runs on the one engine.** An `OutboundConnector`'s
deliveries are `OutboxDelivery` rows of kind `CONNECTOR`, drained by the
same dispatcher, with the same 72-hour ceiling, the same SSRF-safe sender,
the same per-subscriber isolation and the same dead-letter replay as an
app's (doc 188 §5). One external delivery mechanism serves both.

## 3. The private app: a service account, with the app's safeguards and none of the directory

A **service account** is doc 34's original case. An `api-access.manage`
holder creates it for a partner who will call NEWAX's API, and it must
**survive the person who created it** — the reason ADR-037 deferred it and
ADR-073 now completes it. It is an `ApiClient` (`kind = SERVICE_ACCOUNT`)
plus its login-disabled actor `User`, exactly as for an installed app (doc
189 §1), with every safeguard of doc 189:

- the grant is `ApiClient.permissionKeys`: real `PERMISSION_CATALOG` keys,
  never a wildcard, never empty (the `CHECK` in doc 189 §1);
- the creator must **hold every key granted** — doc 187 §4.1's "you cannot
  confer what you were never given", computed by the same
  `previewInstall()`-shaped check, `previewServiceAccount()`;
- the **same bands** — any `medium`/`high` key needs a second holder of
  `api-access.approve_scope`, with ruling 16's recorded fallback on a Solo
  deployment (doc 187 §4.2–4.3);
- `NON_DELEGATABLE_PERMISSIONS` and `API_CLIENT_EXCLUDED_PERMISSIONS` stripped
  and refused, so a service account is never a checker (doc 189 §3);
- the same guards, fail-closed, `@SessionOnly()` routes refused, and the
  per-client rate limit and probing signal (doc 189 §2.2, §4).

What differs from an installed app is only what a directory adds:

| | Directory app | Service account |
|---|---|---|
| Credential | Short-lived tokens minted with the publisher's private key (doc 189 §2.1) | **One long-lived token**, shown once, `expiresAt` mandatory ≤ 365 days, rotated by a `@SessionOnly()` route (doc 189 §2.4) |
| Review | NEWAX (doc 186) | None — the tenant's admin creating it, plus the second approver, **is** the trust decision |
| Kill switch | NEWAX's feed (doc 191 §3) and the tenant | The tenant only: suspend or revoke |
| Receives events | Consented topics via webhook (doc 188) | Not by itself — pair it with an `OutboundConnector` if the partner also needs events pushed |
| Billing | Doc 192 | None beyond the tenant's own plan |
| Consent evidence | `AppInstallationConsent` | Evidence-class `AuditLog` rows `service_account.created`/`.scopes_changed` with from and to keys, and an approver row with the ruling 16 fields on the `ApiClient` itself |

**Routes**, all `@SessionOnly()`: `POST /admin/service-accounts` (create;
returns the token once) and `PATCH /admin/service-accounts/:id` (rename,
change grant — re-banded, re-approved) are gated by `api-access.manage`.
`POST …/:id/rotate`, `POST …/:id/suspend|reinstate` and `POST …/:id/revoke`
(terminal, `REVOKED_BY_ADMIN`) are gated the same way. `POST
…/approvals/:id/approve|decline` is gated by `api-access.approve_scope`,
refusing the creator.

## 4. Which one to use — the screen answers it, not a manual

`/admin/connections` (doc 172 §11's screen: nav key `connections`, group
`settings`) becomes the one place for "connect this business to something".
Its empty state and header ask one question and route by the answer:

| The partner… | Use | Where |
|---|---|---|
| has an app in the directory | **Install it** — reviewed, consented, revocable everywhere | `/admin/apps/directory` (doc 185) |
| needs our events pushed to it | Outbound connector | `/admin/connections` (doc 36) |
| needs you to connect *your* account at their service | OAuth connection | `/admin/connections` (doc 160) |
| exposes data we should pull, or files | Poll or file connector | `/admin/connections` (docs 160, 162) |
| pushes to us in its own format | Inbound webhook | `/admin/connections` (doc 132) |
| will call our API as itself | **Service account** | `/admin/connections/service-accounts` (this document) |
| is really one person's script | Personal API key | `/admin/account/api-keys` (doc 163) |

The Apps directory's own "not connected to the App Directory" state (doc
185 §6) links here, so a deployment with no control plane — doc 48's
offline node, a self-hosted client without a `PlatformTenant` row — still
has every private path. **None of them needs `apps/platform` at all.**

## 5. Graduating a private connection into an app

When a vendor behind many tenants' private connections wants to serve them
all, it becomes a publisher (doc 186) and ships an app. Tenants move by
installing the app and then revoking their service account or connector.
**Nothing migrates automatically.** An installation is a new consent over a
reviewed manifest; converting a tenant's private grant into it silently
would skip exactly the consent screen that makes the directory safe.

## 6. Why the directory does not simply become "shared connectors"

It would be tempting to make an app "an `OutboundConnector` template shared
across tenants". That would lose everything doc 184 §1 asked for: the
reviewed manifest, the consent screen over real permission keys, a
per-installation identity the app authenticates *as*, the kill switch
across every tenant, and the publisher's accountability. The two answer
different questions. A connector is *this tenant's configuration of a call
to somewhere*. An app is *a third party's reviewed offer, accepted by this
tenant*. They share the delivery engine and nothing else.

## Scope lenses

Installation lenses are doc 187's, credential lenses doc 189's, revocation
doc 191's; the connectors' own lenses are in docs 36/132/160/162. Lines
below cover what the service account and the routing screen add.

**The five shop-scale lenses.** *Start to finish* — create → second approval
→ token shown once → partner calls the API → rotate before expiry → revoke.
*The other side* — `api-access.approve_scope`'s approval screen; the
service-account list with usage. *After "done"* — rotation, expiry,
suspension, revocation, graduation. *Real integration* — a standard bearer
token on the existing API. *Policy* — the bands, the exclusion lists and the
365-day ceiling.
**The actor with three tables** — `ApiClient` (`SERVICE_ACCOUNT`) + actor
`User` (`principalKind = API_CLIENT`); the partner organisation itself is not
modelled. If it is also a trading partner, that is its separate
`TradingPartner` row, and nothing links the two, by design: one is a
counterparty in documents, the other a credential.
**The principal with no permission key** — n/a as a new path: the token is
checked by `PermissionsGuard` against its own grant (doc 189 §2.2).
**The grant that ends itself** — `ApiClientToken.expiresAt` ≤ 365 days,
mandatory; it survives its creator (ADR-037's reopening condition), and the
service-account list shows "Created by *(deactivated account)*" so a
remaining admin reviews it; revocation is trigger-final.
**Whose rows, and which columns** — only `api-access.manage` holders list
service accounts; the token hash is never selected; its reach is the node
(doc 185 §2.3's reasoning applies identically).
**The threshold nobody approves alone** — doc 187 §4.2's bands, applied to
`permissionKeys`, and to additions on a grant change.
**The toxic pair, caught at grant or at act** — creator ≠ approver, refused in
`ServiceAccountsService.approve()`.
**Authority and blast radius** — the worst value is a year-long token with
every delegatable `high` key its creator holds, bounded by the second
approver and the creator's own holdings, and audited from → to.
**Audience is a capability, not an address** — approval requests reach
`api-access.approve_scope` holders through the action hub; expiry warnings
(30 and 7 days before) reach `api-access.manage` holders there too, never a
fixed address.
**Request or record** — create and change are REQUESTS; revoke is a RECORD,
never refused.
**The movement with no address / money lenses** — n/a: see doc 189.
**Four hours down** — no control plane is involved anywhere in this document;
private connections keep working through any `apps/platform` outage.
**Dry run before live** — `previewServiceAccount()` is pure; its second caller
is the create form's live "This account will be able to…" panel.
**Click the number** — "Expires in 12 days" opens the token; "3,100
requests" opens the request-log windows.
**Three silhouettes** — identical per node.
**The absent collaborator** — `connectors` off: service accounts still work,
and the routing screen hides the connector rows it cannot offer.
`app-installations` off: the "Install it" row is hidden. No control plane:
every private path works.
**The second copy of the write** — a retried create makes a second account
whose token reached no one; it is inert, expires, or is revoked from the
list. Revoke is predicate-on-write.
**The hundred-thousandth row** — service accounts are tens per node.
**The adoption test** — n/a: node-local, cuid.
**The reversal document** — revocation (terminal); partial reversal is a
narrowed grant, audited from → to.
**The undo fan-out** — revoke kills the token (automatic); writes already
made stand (deliberately irreversible).
**The version stamp** — the evidence audit rows with from and to keys.
**The erasure the ledger cannot obey** — as doc 189: the actor holds no
personal data; creator and approver keep foreign keys to ruling 1's
tombstone.
**The failure path** — a dead token gets a 401 naming why; a connector's
failed deliveries are `OutboxDelivery` dead letters with replay (doc 188 §6)
under `connectors.manage`.

## Work orders

**WO-193.1 — `ServiceAccountsService`** on doc 189's `ApiClientsService`:
`previewServiceAccount()` (pure), `create()`, `update()` with re-banding,
`approve()`/`decline()`, `rotate()`, `suspend()`/`reinstate()`, `revoke()`;
expiry warnings as an `ActionHubSource`.
**WO-193.2 — routes** (§3), each `@SessionOnly()`, pinned in
`session-only-routes.spec.ts`.
**WO-193.3 — screens**: `/admin/connections/service-accounts` (list, create
with the live preview, detail with usage and rotate/revoke), the approval
screen, and the routing header on `/admin/connections`; en/ur.
**WO-193.4 — doc 36 alignment**: when the `connectors` module is built,
its outbound deliveries register as the `CONNECTOR` source of doc 188's
registry, not a separate worker (doc 184 §7's pointer note records this).

## Acceptance

- A tenant with no directory credential and no control plane can still
  create an outbound connector (once doc 36 is built) and a service account,
  and a partner can call the API with it.
- A service account survives its creator's deactivation, and its list entry
  says who created it.
- A service account never holds a checker, non-delegatable or
  `org.access.grant` key.
- The routing screen offers "Install it" only when the directory is
  reachable and `app-installations` is on.

## Out of scope

A shared, cross-tenant catalogue of connector templates — that would be a
directory without review or consent (§6). Automatic migration from a private
connection to an app (§5).
