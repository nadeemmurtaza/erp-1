# 189 — App → NEWAX: completing doc 34's `ApiClient` as the installed app's own identity, checked by the same guards as everyone else

> **Status: proposed, not yet built — and this is doc 34's deferred work,
> now required.** Doc 34's `ApiClient` was deferred by ADR-037 ("service
> accounts: deferred — reopen by superseding this entry when an integration
> must outlive the person who set it up"). An installed app is that case
> exactly: it must survive its installer's departure, or every tenant loses
> its integrations at the next staff change. ADR-073 supersedes ADR-037's
> deferral. Nothing below exists yet (grep, `main` at `642b2831`: no
> `ApiClient`, `ApiClientToken`, `principalKind`). Everything it reuses from
> doc 163 **is** built and cited. Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program.

## 1. `ApiClient`, with the four corrections doc 34 needs

Doc 34's design stands: an organisation-level principal whose access is its
**own declared grant**, never "whatever permissions the creating admin
happens to hold", checked beside `PermissionsGuard` rather than instead of
it. Four things in it cannot be built as written:

1. **No `organizationId`.** ADR-044/040/054: this deployment *is* the
   tenant. The column would be the recurring mistake those ADRs removed from
   docs 20, 21, 23, 130 and 157.
2. **It needs a `User` row — a login-disabled one — or it cannot write.**
   `request.user.id` flows into 216 controller call sites and 75 Prisma
   relations to `User` (`createdById`, `actorId`, `approvedById`, …; doc 184
   §6 item 1). An `ApiClient` id there violates a foreign key on every
   attributed write. Doc 170 §4.1 already reached this answer for the
   support session: "a fixed, login-disabled support `User` … (so every
   `AuditLog.actorId` resolves), whose effective permissions are exactly the
   purposes' keys". Here the actor `User` carries **attribution only**. It
   holds no role, no override and no `AdminScope`, and its permissions come
   from `ApiClient.permissionKeys` and nothing else (§7). Doc 34's rule —
   "never a `User` in disguise" — was about access inheritance, and that
   rule is kept exactly.
3. **Credentials are tokens, not one `keyHash` column.** An installed app
   authenticates with its **own private key** and receives short-lived
   tokens (§2). A service account keeps one long-lived token (doc 193). Both
   live in `ApiClientToken`, so one guard path serves both.
4. **The request log is flushed, not written per request.** Doc 34 WO-34.3
   specifies "atomic per-minute counter increment" per request, which is a
   database write on every API call. Counting happens in memory and is
   flushed once a minute per client per process (§4) — the same trade doc
   163 made for `lastUsedAt` ("at most once a minute").

```prisma
// apps/api/prisma/schema/core.prisma — additive

enum UserPrincipalKind {
  PERSON       // every existing row — the default, so nothing changes for them
  API_CLIENT   // the login-disabled actor of an ApiClient (§7)
}
// model User { … principalKind UserPrincipalKind @default(PERSON) … }

enum ApiClientKind {
  SERVICE_ACCOUNT    // doc 34's own case: created by an admin for a private integration (doc 193)
  APP_INSTALLATION   // created only by AppInstallationsService.install() (doc 187 §3)
}

enum ApiClientStatus { ACTIVE  SUSPENDED  REVOKED }   // doc 34's enum, unchanged

enum ApiClientRevokedReason {
  UNINSTALLED            // the tenant uninstalled the app
  LISTING_REMOVED        // NEWAX removed the listing (doc 191 §3)
  PUBLISHER_TERMINATED   // NEWAX terminated the publisher
  REVOKED_BY_ADMIN       // a service account revoked by api-access.manage
}

model ApiClient {
  id                 String                  @id @default(cuid())
  kind               ApiClientKind
  label              String                  // the app's name, or the service account's name
  actorUserId        String                  @unique
  status             ApiClientStatus         @default(ACTIVE)
  /// THE grant. PERMISSION_CATALOG keys, written only by setGrant() inside a
  /// consent (doc 187) or service-account (doc 193) transaction. Never a
  /// wildcard; never empty for SERVICE_ACCOUNT (CHECK).
  permissionKeys     String[]
  rateLimitPerMinute Int                     @default(600)
  createdByUserId    String
  approvedByUserId   String?
  approvalShortfall  Boolean                 @default(false)   // ruling 16 (doc 187 §4.3)
  approverRosterSize Int?
  suspendedAt        DateTime?
  suspendedReason    String?
  revokedAt          DateTime?
  revokedReason      ApiClientRevokedReason?
  revokedById        String?
  lastUsedAt         DateTime?
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt

  actorUser   User                  @relation("ApiClientActor", fields: [actorUserId], references: [id])
  tokens      ApiClientToken[]
  requestLogs ApiClientRequestLog[]

  @@index([kind, status])
}
// Hand-written, mirroring migrations/20260925120000_add_personal_api_keys:
//   CHECK ((status = 'REVOKED') = (revokedAt IS NOT NULL AND revokedReason IS NOT NULL))
//   CHECK (cardinality(permissionKeys) > 0 OR kind = 'APP_INSTALLATION')  — an app may be webhook-only
//   TRIGGER api_client_revocation_is_final — refuses any UPDATE of a REVOKED row
//     except revokedById → NULL (the ON DELETE SET NULL of an erased revoker),
//     exactly as api_key_revocation_is_final does for ApiKey.

model ApiClientToken {
  id            String    @id @default(cuid())
  clientId      String
  /// hashApiKey(raw) — SHA-256 hex (core/security/api-token.ts). An unsalted
  /// fast hash is correct for 256 random bits, doc 163 §2's own reasoning.
  tokenHash     String    @unique
  lastFour      String
  expiresAt     DateTime
  /// APP_INSTALLATION only: the signing-key id whose JWT minted this token,
  /// so revoking a key on the feed revokes exactly its tokens (doc 191 §3).
  mintedWithKid String?
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())

  client ApiClient @relation(fields: [clientId], references: [id])

  @@index([clientId, expiresAt])
}

/// Doc 34's model, with three more counters and no organizationId.
model ApiClientRequestLog {
  id               String   @id @default(cuid())
  clientId         String
  windowStart      DateTime // truncated to the minute
  requestCount     Int      @default(0)
  deniedCount      Int      @default(0)   // 403 from PermissionsGuard for this principal
  rateLimitedCount Int      @default(0)   // 429
  errorCount       Int      @default(0)   // 5xx

  client ApiClient @relation(fields: [clientId], references: [id])

  @@unique([clientId, windowStart])
}
```

**`ApiClient` is node-local**, like `ApiKey` (doc 163's adoption lens: "never
leaves the node that minted it"). It is never registered with
`ReplicationRegistry`, and neither is its actor `User`.

## 2. How an app authenticates — its private key mints short-lived tokens

GitHub Apps get this right. The durable secret is **the app's private key**,
held only by the publisher. The app proves it holds it by signing a short
JWT, and exchanges that for an **installation access token** that expires
within the hour. Nothing long-lived and per-tenant sits at the app waiting
to leak, and a tenant's database holds only token hashes and public keys.

### 2.1 Minting

`POST /app-installations/:installationId/access-tokens` — in the
`app-installations` module, because it reads `AppInstallation`. It is
`@Public()` with its own verification, the same shape as every other
key-hash endpoint (`TradingPartner`, `Node` and `PosTerminal` endpoints are
`@Public()` routes that verify their own key; doc 163 §7 "Existing state").

```
Authorization: Bearer <JWT>
  header: { alg: "ES256" | "RS256", kid: "<a kid in AppInstallation.signingKeys>" }
  claims: { iss: "<AppInstallation.listingRef>",
            sub: "<installationId>",
            aud: "<this deployment's API_PUBLIC_URL>",
            iat, exp }                        exp − iat ≤ 300 s; ±60 s clock skew
```

`AppTokenService.mint()`:

1. **Refuse a bearer credential of any NEWAX prefix** (`nxa_`/`nxs_`/`nxc_`):
   only a private-key holder mints.
2. Load the installation by `sub`. It must be `ACTIVE`; a `SUSPENDED` or
   `UNINSTALLED` one → 401 naming the state.
3. Pick the key by `kid` from `signingKeys`. Verify with
   `JwtService.verifyAsync(token, { publicKey, algorithms: [alg], issuer:
   listingRef, audience: API_PUBLIC_URL })` — `@nestjs/jwt` 11.0.2, already
   an `apps/api` dependency and already used by `EmbedWidgetsService`. No new
   dependency. The `aud` check is why a JWT made for tenant A is refused by
   tenant B even though both hold the same public key (§5).
4. `ApiClientsService.mintToken(clientId, { ttlSeconds: 3600, kid })`:
   `generateApiKey('nxc')` (`core/security/api-token.ts`), store its hash, and
   return the raw value once. At most 10 unexpired tokens per client — minting
   an eleventh revokes the oldest. At most 30 mints per installation per
   minute.
5. The first mint stamps `AppInstallation.firstTokenAt` (doc 187 §3 step 6).

Response: `{ token: "nxc_…", expiresAt, permissions: [...effective keys],
apiBaseUrl }`. The app caches the token and mints a new one before expiry.

### 2.2 Using a token — the existing guards, one new branch

`JwtAuthGuard` (`core/auth/guards.ts`) already branches on
`apiKeySurfaceOf(credential)` for `nxa_`/`nxs_`. It gains one more branch
for `API_CLIENT_TOKEN_PREFIX` (`nxc`, in `packages/shared/src/api-keys.ts`).
`apiKeySurfaceOf()` still returns null for it, so neither path can mistake
one for the other. `ApiClientAuthService.authenticate(raw, { clientIp })`
(`core/auth/api-clients/`) mirrors `ApiKeyAuthService.authenticate()` step
for step:

```
0. this address has ≥ API_KEY_FAILURE_LIMIT failures this minute → 429, no lookup
   (the SAME per-address failure table ApiKeyAuthService keeps, so alternating
    nxa_/nxc_ guesses does not double a guesser's budget)
1. tokenHash lookup (unique index)                → 401 "not valid"
2. token.expiresAt > now, token.revokedAt null     → 401 "expired" / "revoked"
3. client.status ACTIVE                             → 401 "suspended" / "revoked: <reason>"
4. actor user isActive AND principalKind API_CLIENT → 401 "not valid" (defence in depth)
5. permissions = effectiveApiClientPermissions(client.permissionKeys)   (pure, §3)
6. rate limit (§4)                                  → 429 with Retry-After
7. lastUsedAt, best-effort, at most once a minute
        ▼
request.user = { id: actorUserId, roles: [], permissions, email: null,
                 apiClient: { id, kind, label } }
```

`PermissionsGuard` sees `user.apiClient` and decides with
`decideApiKeyAccess()` (`core/auth/api-keys/api-key-access.ts`), generalised
to take the principal's surface. An `ApiClient` is surface `ADMIN`, so every
rule in that function applies unchanged:

- **fail-closed** — a route must name a `@RequirePermission` key it holds;
- a `@SessionOnly()` route is refused whatever it holds;
- a `@CustomerScope`-only route is refused.

There is **no second authorization system**. The route's own decorator, the
same resolver output shape (`user.permissions`) and the same column checks
(`stripOrderCost()` reads `user.permissions`) decide for an app exactly as
for a person.

On a `@Public()` route a token is authenticated (a dead one is told so),
and it personalises the request only when the route names a capability the
client holds. That is the same rule `JwtAuthGuard.authenticateApiKey()`
applies, for the same reason: `POST /orders` and the cart are `@Public()`,
and an app must never become "a signed-in customer" there.

### 2.3 The webhook secret — fetched with the private key, never with a token

`GET /app-installations/:installationId/webhook-secret` and `POST
…/webhook-secret/rotate` are `@Public()` routes authenticated by the **same
JWT** as §2.1, and they refuse every bearer-token prefix. A leaked access
token can therefore never read or rotate the secret. Rotation keeps the old
secret signing alongside the new for 24 hours (doc 188 §3), and
`webhookSecretRotatedAt` records it.

### 2.4 Service accounts

A `SERVICE_ACCOUNT` has no private key. An `api-access.manage` holder
creates it on the private-connections screen (doc 193), and it gets **one**
long-lived `ApiClientToken` with a mandatory `expiresAt` of at most 365 days
— doc 163's `API_KEY_MAX_LIFETIME_DAYS`, the same "a grant nobody
remembers to end" rule. It is shown once and rotated by a `@SessionOnly()`
route. Everything from §2.2 onward is identical.

## 3. What an app can never hold

`effectiveApiClientPermissions(keys)` (pure, `packages/shared/src/api-keys.ts`)
returns `keys − NON_DELEGATABLE_PERMISSIONS − API_CLIENT_EXCLUDED_PERMISSIONS`.
It runs at request time, like `effectiveApiKeyPermissions()`, so a key added
to either list later drops out of every live client on its next request
with no migration. `validateAppManifest()` (doc 185 §2.1) refuses the same
keys at submission, and `setGrant()` refuses them at write — three places,
following doc 163 §3's "no single forgotten check opens it".

**`NON_DELEGATABLE_PERMISSIONS` gains three entries**, each with its reason
beside it in the file, as the list requires:

| Key | Reason |
|---|---|
| `apps.manage` | Installing an app mints a principal that outlives the key, its revocation and its owner |
| `api-access.manage` | Creating a service account mints a credential that outlives the key |
| `api-access.approve_scope` | Approving is being the second person; a key carries its owner's `userId` and an app carries its own, so neither may ever be the checker (ADR-037's consequence) |

These also bind personal keys (doc 163). The `api-keys.spec.ts` assertions —
every entry names a real catalogue key — cover them.

**`API_CLIENT_EXCLUDED_PERMISSIONS`** (new) applies to `ApiClient`s only. A
person may hold these; a non-person may not:

- **`CHECKER_PERMISSIONS`** — the second half of every explicit maker-checker
  pair in `PERMISSION_CATALOG`: `pricing.price-lists.approve`,
  `purchasing.requisitions.approve`, `finance.wallets.adjust.approve`,
  `finance.credit-notes.approve`, `finance.settlement.approve_writeoff`,
  `finance.facilities.approve_drawdown`, `platform.flags.approve_rollout`,
  `api-access.approve_scope`. Doc 163 §9 asked what the service account
  must decide: "every existing `approvedBy ≠ createdBy` comparison … must
  decide whether it may be the second person". The answer is **never**, and
  it is enforced structurally — an app cannot hold the checker key — rather
  than by adding a principal-kind check to each approval method, which the
  next approval method would forget. `ApprovalService.start()`
  (`core/approvals/approval.service.ts`) additionally refuses an
  `approverUserId` whose `principalKind` is not `PERSON`, so a step cannot
  name an app's actor directly. A spec asserts that every catalogue key
  containing `approve` is in `CHECKER_PERMISSIONS` or on a written exemption
  list. The exemption list has one entry today — **`payments.approve`**:
  it confirms a bank transfer or COD collection and issues refunds, so it is
  a single-actor act, not the second half of a pair. A reconciliation app may
  legitimately hold it, subject to doc 187's second-approver threshold at
  install.
- **`org.access.grant`** — `OrgUnitGrantService.issue()` bounds what a granter
  confers to what they hold. But the `OrgUnitGrant` it writes to a **person**
  outlives the app's uninstall, so an app holding it could hand its keys to a
  human account that survives revocation. That is `NON_DELEGATABLE_PERMISSIONS`'
  own escalation criterion. It is excluded for apps here. Whether personal
  keys should lose it too is doc 163's decision, flagged in ADR-073, not made
  here.

## 4. Quota, usage and the signal of an app reaching for more

**Rate limiting protects the platform; the grant protects the data** — doc
34 §3's own separation, kept. `rateLimitPerMinute` defaults to 600 for an
installation. An `apps.manage` holder may set it between 60 and 3,000 on the
installation screen, as an evidence-audited change. It is enforced in memory
per process, the same scope as `ThrottlerGuard`'s storage. ADR-018 (replicas)
is open, and both move to shared storage together, as doc 163 §2 already
states for its failure table. An exceeded window returns `429` with
`Retry-After`, never a silent drop.

`ApiClientRequestLog` is flushed once a minute per client per process, as an
upsert on `@@unique([clientId, windowStart])` incrementing by the in-memory
counts. It is one write per client per minute, never one per request. It
feeds:

- the installation screen's **"4,120 requests today · 18 refused"**, each
  number drilling into its windows;
- **the probing signal** — more than 50 `deniedCount` in an hour raises one
  action-hub item for `apps.manage` holders: "*App* is calling things it
  wasn't granted". A correct app asks only for what it declared, so repeated
  403s are either a bug or reconnaissance, and the tenant should know either
  way (doc 186 §5.2).

Retention: windows older than 90 days are deleted nightly by
`ApiClientRequestLogRetentionCron`. A year of one busy client is 525,600
rows (doc 34's own arithmetic), bounded by the unique index.

**Attribution.** Every write through an app records `actorUserId` wherever
the route already records `user.id`. The audit list and every "created by"
label render an `API_CLIENT` actor as "App: *label*" — resolved from
`ApiClient.label` through the actor — so a person reading history sees
which app did what.

## 5. Tenant isolation, by construction

- A token's hash exists only in the database of the node that minted it. The
  same raw token presented to any other tenant's deployment finds no row →
  401. There is no directory of tokens anywhere, and no platform-side copy.
- A minting JWT names `aud = API_PUBLIC_URL` of one deployment and `sub` = an
  installation id that exists in only that deployment. Tenant B refuses A's
  JWT on the audience, and would refuse it again on the unknown installation.
- The app's public keys are the same for every tenant (they come from the
  manifest), but a public key grants nothing. It only verifies a JWT whose
  audience and subject bind it to one installation on one node.
- So the blast radius of a **fully compromised app** — its private key and
  every token it holds — is exactly the tenants that installed it, times
  exactly the keys each granted, until each installation is suspended.
  Doc 191 §4 contains it.

## 6. Revocation in the middle of a request

Authentication is per request. A request authenticated before its client is
revoked finishes inside its own database transaction, and the next request
is refused. That is the same guarantee doc 163 gives a revoked key ("stops
it authenticating on the very next request").

**Work that outlives a request re-checks at each chunk.** Any job a route
starts that runs after the request returns — a bulk import, an export, a
batch recompute — records the `actorUserId` that started it. Its chunk loop
calls `ApiClientsService.isLive(actorUserId)` before each chunk: true for a
`PERSON`, true for an `API_CLIENT` whose client is `ACTIVE`. It stops with a
recorded reason otherwise. This is the catalogue lens *Row 4,312's
authority*, applied to a principal that can be revoked mid-run. WO-189.9
enumerates the job-starting routes an `ApiClient` can reach (from
`docs/index/cross/routes.md`: fail-closed means only `@RequirePermission`
routes) and adds the check to each.

## 7. Keeping the actor `User` an actor and never a login

`principalKind = API_CLIENT` rows are created only by
`ApiClientsService.issue*()`, with `email`, `phone`, `passwordHash` and
`ssoExternalId` all null. The first name is the client label, and the last
name is "(app)" or "(service account)". Every path that could turn one into
something more is refused explicitly, not just unlikely:

| Path | Where | Behaviour |
|---|---|---|
| Password sign-in, reset, verification, SSO linking | `AuthService.login()`, `requestPasswordReset()`, `SsoService` | Refused for non-`PERSON` before any credential check. With no email or phone the row cannot be found anyway; the check is defence in depth |
| A JWT naming it | `JwtStrategy.validate()` | Refused — no session is ever issued to it |
| Edit, reset password, (de)activate by hand | `UsersAdminService` | Refused: "This identity belongs to an app — manage it from Apps". Deactivation happens only through the client's own lifecycle |
| Role assignment, permission override | `RolesService.assign()`, the `UserPermission` write path | Refused, so its only grant is `ApiClient.permissionKeys` and a role editor can never widen an app outside consent |
| `AdminScope` grant | `organization`'s grant route | Refused in v1 (doc 185 §2.3); later written only by `ApiClientsService` |
| Being named as an approver | `ApprovalService.start()` | Refused (§3) |
| Staff lists | `/admin/users` and user pickers | Filtered to `PERSON` by default |
| Audience resolution | `PermissionsResolverService.usersWithPermission()` | Unaffected — it reads role grants and overrides, and the actor has neither; a spec pins it |
| Billable seats | `SeatCounterService.countBillableSeats()` (`apps/platform`) | Unaffected — it counts users with a `UserRoleAssignment`. Its header comment ("never as `User` rows") is corrected to say actors exist and are excluded by the same predicate |

## Scope lenses

The installation-level pass is doc 187's; revocation and isolation are doc
191's. Lines below cover what this credential introduces.

**The five shop-scale lenses.** *Start to finish* — JWT → mint → `nxc_` →
guarded request → rotate before expiry → revoked with the installation.
*The other side* — the installation screen's usage and refusals (§4);
`api-access.manage`'s service-account list (doc 193). *After "done"* —
expiry, rotation, suspension, revocation, the job re-check (§6). *Real
integration* — a standard bearer token on the existing API, usable from any
HTTP client. *Policy* — `NON_DELEGATABLE_PERMISSIONS`,
`API_CLIENT_EXCLUDED_PERMISSIONS` and the rate-limit bounds, all code or
audited data.
**The actor with three tables** — `ApiClient` plus its actor `User`
(`principalKind = API_CLIENT`), linked by `actorUserId @unique`. No `Party`,
`Contact` or `TradingPartner` link, because an app is not a counterparty in
the ledger.
**The principal with no permission key** — two paths, both named. The
minting JWT is checked against installation status, key set, issuer and
audience, never `PERMISSION_CATALOG`, and can only mint for its own
installation. The `nxc_` token is checked by `PermissionsGuard` against
`effectiveApiClientPermissions()`. Rows: the whole node (§3; doc 185 §2.3).
**The grant that ends itself** — tokens at most 60 minutes (installation) or
365 days (service account), `expiresAt` mandatory on every token. Clients
end by revocation (doc 191) and never by their creator's departure, by
design (doc 187 §4.4). On an actor's deactivation, which happens only
through its client, every token dies with the client's status check.
**Whose rows, and which columns** — its reach is its effective permissions
over this node's rows. Every column check reading `user.permissions`
applies unchanged. `tokenHash` is never selected by any read path. The
secret is returned once, at mint.
**The threshold nobody approves alone** — applied at consent (doc 187 §4.2)
and at service-account creation (doc 193 §3), not per request.
**The toxic pair, caught at grant or at act** — the one this credential could
have created — app as maker and checker — is removed structurally:
`CHECKER_PERMISSIONS` can never be held (§3), refused at submission, at
`setGrant()` and at request time; `ApprovalService.start()` refuses a
non-person approver.
**Authority and blast radius** — the widest value here is a client's
`permissionKeys`, bounded by consent (doc 187 §4). `rateLimitPerMinute` is
bounded to 60–3,000 and audited old→new. The fully compromised case is §5's.
**Audience is a capability, not an address** — the probing and rate-limit
items go to the action hub for `apps.manage` holders, one per installation
per hour, never a mail per 403.
**Request or record** — every request made with a token is classified
exactly as the same request from a person, because the route decides.
`ApiClientRequestLog` is a RECORD, never refused. Minting is a REQUEST,
refused on a bad key, a dead installation or a rate limit.
**The movement with no address** — n/a: authentication moves nothing, and
any stock or cash write goes through its route's own `locationId` rule.
**Four hours down, the counter stays open** — the app retries on its own
schedule; this node down means its tokens simply are not checked. Tokens
are node-local, so a branch node verifies tokens minted on it while its
parent is down.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: no journal entry; writes
made with a token post under their module's own rule.
**Dry run before live** — `effectiveApiClientPermissions()` and
`decideApiKeyAccess()` are pure. The installation screen's "What this app
can do" panel is the second caller of the first.
**Click the number** — "18 refused" → the windows with `deniedCount > 0`;
"4,120 requests" → the windows summed; both reproduce the tile.
**Three silhouettes** — identical at every edition. The node is the
boundary, and no tier column exists or is needed for v1's `DEPLOYMENT`
scope.
**The absent collaborator** — `app-installations` off: no mint route exists,
so no `APP_INSTALLATION` token can come into being; service accounts still
work (doc 193). The action hub off: signals still live in
`ApiClientRequestLog`.
**The second copy of the write** — a retried mint makes a second token; the
first is inert and expires, and the 10-token cap bounds it.
`tokenHash @unique`. Revoke is predicate-on-write (`status <> 'REVOKED'`) and
trigger-final. The request log's unique window makes a flush from two
processes additive, never duplicated.
**The hundred-thousandth row** — tokens: about 24 per installation per day,
pruned 24 hours after expiry by `ApiClientTokenPruneCron`. Authentication is
one unique-index lookup plus one primary-key read of the client — no
permission query, because the grant is on the row. The request log is 1,440
rows per client per day, bounded by 90-day retention.
**The adoption test** — n/a: no human-readable code; `nxc_` values are 256
random bits, node-local.
**The reversal document, not the reversal flag** — revocation is terminal:
`revokedAt`/`revokedReason`/`revokedById`, final by trigger. The partial
reversal is suspension (reversible) or a narrowing version (doc 185 §5).
**The undo fan-out** — revoking a client kills every token (automatic,
checked per request), stops chunked jobs (automatic, §6), and deactivates the
actor (automatic). Writes already made stand (deliberately irreversible, as
for any revoked credential).
**The version stamp** — no version column on the client. The grant is
explained by the consent rows (doc 187 §1) and the `app.scopes_changed`
evidence rows with from and to.
**The erasure the ledger cannot obey** — the actor `User` holds no personal
data. `createdByUserId`, `approvedByUserId` and `revokedById` keep their
foreign keys to ruling 1's tombstone (`revokedById` set null, as on
`ApiKey`). Tokens cascade with nothing to preserve.
**The failure path, and who is allowed to walk it** — a dead token gets a 401
naming why, plus a `warn` log with the client id and never the token. A
rate-limited request gets a 429 with `Retry-After`. The installation screen
shows the client's status and the last refusals to `apps.manage`. There is
no replay: a refused request is the app's to retry.

**Catalogue lenses.** *Quota has no owner* — owned by
`ApiClient.rateLimitPerMinute`, per client, above the global per-address
failure limiter. *The gate checked once, not per action* — per request, per
token, per chunk (§6). *Which tier owns the credential* — the tenant node
(the token hash); the publisher (the private key); never the platform.

## Work orders

**WO-189.1 — schema**: `UserPrincipalKind` + `User.principalKind`;
`ApiClientKind`, `ApiClientStatus`, `ApiClientRevokedReason`, `ApiClient`,
`ApiClientToken`, `ApiClientRequestLog` in `core.prisma`; the CHECKs and
`api_client_revocation_is_final`; forward-only migration (no backfill:
`PERSON` is the default).
**WO-189.2 — `packages/shared/src/api-keys.ts`**: `API_CLIENT_TOKEN_PREFIX`,
`isApiClientToken()`, `CHECKER_PERMISSIONS` + its exemption list,
`API_CLIENT_EXCLUDED_PERMISSIONS`, `effectiveApiClientPermissions()`, the
three `NON_DELEGATABLE_PERMISSIONS` entries with reasons; spec (every
`approve` key classified; prefixes never collide with `nxa`/`nxs`/`eyJ`).
**WO-189.3 — `core/auth/api-clients/`**: `ApiClientsService`
(`issueForInstallation`, `issueServiceAccount`, `setGrant`, `suspend`,
`reinstate`, `revoke`, `mintToken`, `revokeTokensForKid`, `isLive`),
`ApiClientAuthService.authenticate()`; the `JwtAuthGuard` branch;
`decideApiKeyAccess()` generalised to a surface; the shared per-address
failure table.
**WO-189.4 — rate limit and usage**: in-memory limiter, per-minute flush,
retention cron, the probing action-hub source.
**WO-189.5 — actor refusals**: every row of §7's table, each with a spec;
the `SeatCounterService` comment correction.
**WO-189.6 — app token routes** (`app-installations`): `access-tokens`
mint, `webhook-secret` get and rotate, JWT verification via `JwtService`,
mint limits, refusal of bearer-token prefixes.
**WO-189.7 — `ApiClientTokenPruneCron`**.
**WO-189.8 — tests**: `apps/api/test/api-clients.e2e-spec.ts`, modelled on
`api-keys.e2e-spec.ts`: fail-closed routing; `@SessionOnly()` refused; a
revoked client refused on the very next request; the trigger refusing an
un-revoke; a JWT with the wrong `aud` refused; an A-minted token refused by
B in a two-database test (doc 39's own isolation acceptance style); a
checker key stripped even if a row carries it; the actor unable to log in,
be edited or be assigned a role.
**WO-189.9 — chunk re-check**: enumerate the job-starting routes reachable by
an `ApiClient` and add `isLive()` at each chunk boundary.

## Acceptance

- An app's effective permissions never include a non-delegatable, checker
  or `org.access.grant` key, even if `permissionKeys` holds one.
- An app token reaches only `@RequirePermission` routes whose key it holds;
  never a `@SessionOnly()` route, a `@CustomerScope`-only route, or the
  webhook-secret routes.
- A token for tenant A, or a JWT minted for tenant A, is refused by tenant
  B.
- Revoking a client refuses its next request with a 401 naming the reason,
  and no code path can un-revoke it.
- The actor `User` cannot sign in, be edited, receive a role or override, or
  be named an approver; it never appears in `/admin/users` or in
  `usersWithPermission()`.
- 1,000 requests in one minute from one client produce one
  `ApiClientRequestLog` row per process for that window, correctly counted.
- Every write made through an app attributes to its actor, and history shows
  "App: *label*".

## Out of scope

OAuth "log in with NEWAX" for an app's *own* end users (doc 34's out of scope,
unchanged). Per-token scoping narrower than the installation's grant — an
app wanting less can ask for less. mTLS or IP allowlisting per client —
real, and available later as additive columns; not required when tokens
live for an hour. Shared-storage rate limiting across replicas (ADR-018,
open).
