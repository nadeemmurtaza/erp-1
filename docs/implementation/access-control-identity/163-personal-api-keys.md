# 163 — Personal API keys

A signed-in person mints a key that carries **a subset of their own access**,
and hands it to an AI agent (over MCP or plain HTTP), a script, or a third-party
integration instead of handing over their account. The shape is GitHub's
fine-grained personal access tokens and Cloudflare's API tokens: the key acts
as its owner, never as anyone more powerful, and it dies with them.

This is the document of record for the feature. `DECISIONS.md` ADR-037 records
the actor-model decision and the deferred follow-up; doc 34
(`integrations-connectivity/34-partner-developer-api-access.md`) keeps the
deferred service-account design.

> **Status: built.** Two surfaces — the admin API and the customer's own
> storefront API — sharing one lifecycle. Service accounts (a principal that
> survives its creator) are **deliberately not built**; see §9.

---

## 1. The three decisions this feature is built on

These were put to the owner directly and answered. They are inputs, not open
questions.

1. **A key is a personal token.** It belongs to the user who created it. Its
   effective access on every single request is

   ```
   (the scopes chosen when the key was made)
     ∩ (that user's live permissions, resolved on this request)
     − NON_DELEGATABLE_PERMISSIONS
   ```

   recomputed per request by `ApiKeyAuthService.authenticate()`, never
   snapshotted. A demoted owner's keys shrink on the next request; a removed
   role grant drops out of every key the next time it is used; a deactivated
   owner's keys are revoked in the deactivation transaction itself.
2. **A separate, explicit non-delegatable list** decides what can never be put
   in a key — not `PermissionDefinition.sensitivity`. That tag drives the
   role-wizard warning (`low`/`medium`/`high`/`critical`); it answers "how bad
   is it to grant this to the wrong person", which is a different question
   from "can this be used to take more access than it was given". Refunds are
   `high` and exactly what an integration may legitimately need; creating a
   user is only `high` too, and must never be delegatable at all.
3. **Both surfaces, now.** The admin API already has a catalogue
   (`PERMISSION_CATALOG`); the storefront had none, so §4 designs one.

---

## 2. Architecture

### One table, two scope columns, two guard integration points

`ApiKey` (`core.prisma`) holds the lifecycle every key shares — owner, name,
hash, expiry, rotation, revocation, last use — and **two** scope columns, one
per catalogue:

| Column | Catalogue | Checked against | Meaningful for |
|---|---|---|---|
| `permissionKeys String[]` | `PERMISSION_CATALOG` | `@RequirePermission(...)`, by `PermissionsGuard` | `surface = ADMIN` |
| `customerScopes String[]` | `CUSTOMER_SCOPE_CATALOG` | `@CustomerScope(...)`, by `PermissionsGuard` | `surface = STOREFRONT` |

A hand-written `CHECK` constraint makes a key belong to **exactly one**
catalogue: an ADMIN row has at least one permission key and no customer scope;
a STOREFRONT row the reverse. What a key can see is therefore never ambiguous,
at the database, not only in the service.

The surface is also written into the secret's prefix — `nxa_` for admin,
`nxs_` for storefront (Newax's own prefix, Law 1's one exception, so a rebrand
never renames a credential somebody pasted into a script). The guard checks the
prefix against the row's `surface`; a mismatch is refused as invalid.

### The secret

Same scheme as `TradingPartner.inboundApiKeyHash`, `Node.inboundApiKeyHash` and
`PosTerminal.deviceKeyHash` — `core/security/api-token.ts`'s
`generateApiKey(prefix)` (256 random bits, base64url) and `hashApiKey()`
(SHA-256, hex). Only the hash is stored (`keyHash @unique`); the raw value is in
exactly one HTTP response — the one that created or rotated it. `lastFour` (the
last four characters) is kept so a list can tell keys apart; 252 random bits
remain unknown. An unsalted fast hash is correct here and would be wrong for a
password: the input is uniformly random, so there is nothing to dictionary.

### The request path

```
Authorization: Bearer nxa_…
        │
        ▼
JwtAuthGuard ── prefix is nxa_/nxs_? ── no ──► passport-jwt, unchanged
        │ yes
        ▼
ApiKeyAuthService.authenticate(raw, { clientIp })
  0. this address failed ≥20 times this minute → 429, no lookup at all
  1. keyHash lookup (unique index)          → 401 "not valid"
  2. row.surface matches the prefix         → 401 "not valid"
  3. revokedAt IS NULL                       → 401 "revoked"
  4. expiresAt > now                         → 401 "expired"
  5. owner.isActive                          → 401 "owner no longer active"
  6. ADMIN: permissions = effectiveApiKeyPermissions(key, resolveForUser(owner))
     STOREFRONT: customerScopes = expandCustomerScopes(key)   (write ⇒ read)
  7. lastUsedAt stamped, best-effort, at most once a minute
        │
        ▼  request.user = { id: owner, roles: [], permissions, apiKey: {…} }
PermissionsGuard ── user.apiKey? ── no ──► unchanged session check
        │ yes
        ▼
decideApiKeyAccess(key, route)   (pure, core/auth/api-keys/api-key-access.ts)
  • route is @SessionOnly()                         → 403
  • ADMIN key: route has no @RequirePermission       → 403  ← fail-closed
               key lacks every required permission   → 403
  • STOREFRONT key: route has @RequirePermission     → 403
               route has no @CustomerScope           → 403  ← fail-closed
               key lacks every required scope        → 403
```

**Fail-closed is the core property.** A key reaches only routes that name a
capability of its own surface. Every `@AuthenticatedOnly()` route with no
`@CustomerScope` — `PATCH /auth/me` (changes the email and phone that sign-in
and password reset use), `/me/devices`, `/notification-preferences`,
`/identity-verification/*`, the key-management routes themselves — is
unreachable by any key without anybody having to remember to exclude it. A new
route is unreachable by keys until someone deliberately grants it a scope.

**Guessing is bounded before it costs a query.** The global guards run
authenticate → permissions → throttle, so a request whose credential fails
never reaches `ThrottlerGuard`. For a bad JWT that costs one HMAC check; for a
well-formed garbage `nxa_…` key it would cost a database lookup — an
unthrottled path from unauthenticated traffic to the database. Step 0 closes
it: failed key authentications are counted per client address (the same
`request.ip` `ThrottlerGuard` tracks), and an address with
`API_KEY_FAILURE_LIMIT` (20) failures in a minute gets a 429 with no lookup
until its window passes. Only failures count, so a busy integration is limited
by `ThrottlerGuard` alone, like a session. The table is per process and
bounded at 10,000 addresses — the same scope as `ThrottlerGuard`'s own
in-memory storage; horizontal replicas (ADR-018, open) would move both to
shared storage together.

**On a `@Public()` route** a key is still authenticated (a dead key is told it
is dead), but it only personalises the request when the route declares a
capability the key holds. Otherwise the request proceeds exactly as a guest's
would. This matters for checkout: `POST /orders` and the whole cart are
`@Public()` with an optional signed-in user, and an unscoped key must never
turn into "place an order as the owner".

### `@SessionOnly()` — routes that mint or install a credential

The permission-level list (§3) cannot catch one shape: a route that issues a
credential **behind a permission that is otherwise fine to delegate**.
`purchasing.manage` is a legitimate integration permission (purchase-order
sync), and it also gates `POST /admin/trading-partners/:id/rotate-inbound-key`,
`/invite` and `/outbound-key`. A key holding it could mint a trading-partner
credential that outlives the key, the key's revocation and its owner —
credential laundering. So every route that **issues, rotates or installs a
credential, or changes an account's sign-in identity**, carries
`@SessionOnly()`, and `PermissionsGuard` refuses it to any key whatever the
key holds:

| Route | Gated by | Why session-only |
|---|---|---|
| `POST /admin/trading-partners/:id/rotate-inbound-key` | `purchasing.manage` | mints a `tp_` credential |
| `POST /admin/trading-partners/:id/invite` | `purchasing.manage` | mints a `tpi_` invite credential |
| `POST /admin/trading-partners/:id/outbound-key` | `purchasing.manage` | installs a credential |
| `POST /organization/nodes/:nodeId/rotate-inbound-key` | `organization.manage` | mints a replication credential |
| `POST /admin/pos/terminals/:id/rotate-device-key` | `pos.manage` | mints a device credential |
| `POST /admin/users`, `POST /admin/users/:id/reset-password` | `users.manage` | issues a password |
| `POST /auth/change-password`, `PATCH /auth/me` | own account | the owner's own credential and sign-in identity |
| everything under `/api-keys` and `/admin/api-keys` | own account / `users.manage` | a key never manages keys |

The last five rows are already unreachable by a key through another rule
(non-delegatable permission, or no capability declared); they carry the marker
anyway so the rule is greppable and the next person copying the pattern copies
it. `session-only-routes.spec.ts` asserts the marker on every one of them, and
`.claude/rules/security.md` states the rule for the next credential route.

---

## 3. The non-delegatable list

`NON_DELEGATABLE_PERMISSIONS` in `packages/shared/src/api-keys.ts` — each entry
carries its reason in the code, beside the key. The criterion is **escalation,
not sensitivity**: a permission is on the list when a key holding it could take
more access than it was given — by editing grants, by minting a principal or a
credential that outlives the key, or by taking over the account itself.

| Permission | Why it can never be in a key |
|---|---|
| `roles.manage_permissions` | Edits any role's grants, including a role the key's own owner holds — the key could add any permission to that role and so to itself on the next request. Also an `ADMIN_LOCKED_PERMISSIONS` key. |
| `users.manage` | Creates back-office accounts with a password the caller chooses, assigns roles and personal GRANT overrides, resets other people's passwords: each one mints a principal or widens one outside the key's cap. It is also the oversight permission over every account's keys (§5). |
| `organization.manage` | Grants and revokes `AdminScope` (who is a brand or branch admin) — row-level escalation — and rotates a branch node's replication credential, which can push FACT records into this database and outlives the key and its owner. |
| `settings.manage` | The Settings area holds the store's mailboxes: repointing the transactional SMTP account at a mailbox the caller controls routes every password-reset link — an admin's included — to them. Also `ADMIN_LOCKED_PERMISSIONS`. |
| `pos.manage` | Issues till device credentials: a key holding it could mint a second credential that survives the key's revocation and its owner's deactivation. |
| `account.change_own_password` | The owner's own sign-in credential. A key is a revocable slice of an account; it must never be able to take the account over. |

It is enforced in three places, so no single forgotten check opens it:

1. **At create and at edit** — `ApiKeysService` refuses the key with a 400
   naming the permission and its reason.
2. **At request time** — `effectiveApiKeyPermissions()` strips every
   non-delegatable key from the effective set, so a key written before an
   entry was added to the list loses it on its next request with no migration.
3. **Structurally** — the routes those permissions gate that mint credentials
   are also `@SessionOnly()` (§2).

`packages/shared/src/api-keys.spec.ts` also asserts that every
`ADMIN_LOCKED_PERMISSIONS` key is on the list — a key must never hold a
permission whose loss can lock every admin out.

**Deliberately not on the list**, with the reason, so a later reader does not
"fix" it:

- `payments.approve`, `giftcards.manage`, `loyalty.manage`, `payroll.manage` —
  real money, `high` sensitivity, and exactly what a reconciliation or payroll
  integration needs. Money moved through a key is bounded by its owner's own
  grant and attributed to its owner in every audit row.
- `accounting.manage_periods` — irreversible, but not an escalation.
- `purchasing.manage` — delegatable; its three credential routes are
  `@SessionOnly()` instead.
- `content.manage`, `onsitemessages.manage`, `catalog.manage` — rich text is
  sanitised server-side on every write (`content-sanitizer.ts`), so none is a
  stored-script path into an admin's browser session.
- `crm.manage`, `campaigns.manage`, `marketing.manage` — can send mail as the
  store; misuse, not escalation of access.
- `ai.manage` — sets the AI budget cap and FX rate; provider credentials are
  environment variables, not installable through the API.
- `audit.view` — a SIEM export is a textbook integration.

---

## 4. The customer scope catalogue

A signed-in customer's self-service routes were gated only by "is this your own
row" (`@AuthenticatedOnly()` plus a `user.id` filter). A storefront key needs a
vocabulary for *which* of those rows, so `CUSTOMER_SCOPE_CATALOG` in
`packages/shared/src/api-keys.ts` is that vocabulary — one list, both ends, the
same convention `PERMISSION_CATALOG` follows (`apps/web/src/constants/permissions.ts`
explains why). `@CustomerScope(...)` is typed against it, so a typo is a
compile error; the storefront's scope picker renders from it.

Built only from routes that already exist. `write` implies `read` for the same
resource (`expandCustomerScopes()`), so a route that reads declares only the
read scope.

Two rules hold for every route in the API, not only the ones below, and
`customer-scope-routes.spec.ts` sweeps every controller for both:

- **A route that changes state takes `write` scopes only.** Because `write`
  implies `read`, a `read` scope on a `POST` would let every read-only key
  change state. The same holds when the scope is inherited:
  `StoreCreditAccountController` carries `store-credit:read` on the class, so a
  write handler added to it would open to every read key.
- **Every route that declares a scope, inherited ones included, is in the
  table below.** A new or inherited scope fails the build until it is reviewed.

| Scope | Routes | Why it is here |
|---|---|---|
| `profile:read` | `GET /auth/me` | who the key acts for — name, email, phone |
| `orders:read` | `GET /orders/mine`, `GET /orders/:number` | order-tracking assistants, personal finance tools |
| `addresses:read` | `GET /addresses` | a shipping or address-book integration |
| `addresses:write` | `POST`/`PATCH`/`DELETE /addresses…` | the same, keeping the book current |
| `measurements:read` | `GET /measurements/profiles…` | a tailoring or fit tool reading the saved profiles |
| `measurements:write` | `POST`/`PATCH`/`DELETE /measurements/profiles…` | a body-scanning app writing new measurements in |
| `wishlist:read` | `GET /wishlist`, `GET /back-in-stock` | a shopping assistant watching saved items |
| `wishlist:write` | `POST`/`DELETE /wishlist…`, `POST`/`DELETE /back-in-stock…` | the same, saving items and alerts |
| `reviews:read` | `GET /reviews/mine` | the customer's own reviews, any status |
| `reviews:write` | `POST /reviews` | submitting one — every review is moderated before it shows |
| `returns:read` | `GET /returns/mine`, `GET /returns/:id`, `GET /returns/reasons` | return-status tracking |
| `returns:write` | `POST /returns`, `POST /returns/:id/photos` | an assistant filing a return — staff still decide it |
| `loyalty:read` | `GET /loyalty`, `/loyalty/ledger`, `/loyalty/referral-code`, `/loyalty/referrals` | points and tier; `/referral-code` creates the customer's own code on first read — idempotent, and it moves nothing until someone else applies it, which stays session-only |
| `store-credit:read` | `GET /store-credit`, `/store-credit/ledger` | the customer's own credit balance |

**Left session-only on purpose** — reachable by the customer, never by a key:

- `PATCH /auth/me`, `POST /auth/change-password`, `/auth/resend-verification` —
  the email and phone are the sign-in and password-reset identity; changing
  either is account takeover.
- `POST`/`DELETE /me/devices` — would route the account's push notifications to
  another device.
- `/identity-verification/*` — KYC, interactive and bound to the person.
- `/notification-preferences` — governs what the owner hears about; a key must
  not be able to quiet its owner.
- `/gift-cards/:code/balance`, `/gift-cards/redeem-into-account` — a code
  oracle, and moving a bearer instrument's value.
- `POST /loyalty/redeem`, `POST /loyalty/referral/apply` — converting points to
  spendable credit, and binding the account to another person's referral (it
  pays them).
- `POST /wishlist/migrate` — the browser's one-time `localStorage` hand-off.
- **Cart and checkout** (`/cart/*`, `POST /orders`, `/cart/reorder`) — placing
  an order spends the customer's money and stored value, and together with
  `addresses:write` it would be a toxic pair (§7, the toxic pair). An
  order-placement scope is its own work order.
- `/api-keys` — a key never manages keys.

---

## 5. Lifecycle

| Act | Who | Route | Rules |
|---|---|---|---|
| Create | the owner, signed in | `POST /api-keys` | name 1–80 chars; ≥1 scope from the surface's own catalogue; ADMIN scopes must be delegatable **and held right now**; lifetime 1–`API_KEY_MAX_LIFETIME_DAYS` (365) days, mandatory; at most `API_KEY_MAX_ACTIVE_PER_SURFACE` (20) live keys per owner per surface. Returns the secret once. |
| List | the owner | `GET /api-keys?surface=` | own keys only; each with its live effective scopes and the ones currently paused because the owner no longer holds them |
| Edit | the owner | `PATCH /api-keys/:id` | name and/or scopes; scopes re-validated as at create, except that a permission the key already carries may stay while paused (keeping it widens nothing); a revoked key cannot be edited; the write is predicated on the values it replaces, so a concurrent edit or revoke conflicts instead of being overwritten |
| Rotate | the owner | `POST /api-keys/:id/rotate` | a new secret and a new expiry; scopes unchanged — rotation never widens; the old secret stops working on its next request; works on an expired key (renewal), never on a revoked one; predicated on the hash it replaces, so of two concurrent rotations exactly one wins |
| Revoke | the owner | `POST /api-keys/:id/revoke` | terminal and idempotent |
| Oversee | `users.manage` | `GET /admin/api-keys`, `POST /admin/api-keys/:id/revoke` | every account's keys, metadata only — no one can read a secret after issue |
| Deactivate the owner | `users.manage` | `PATCH /admin/users/:id { isActive: false }` | every live key revoked inside the deactivation transaction (canonical ruling 6); reactivation does **not** revive them |

Every lifecycle route is `@AuthenticatedOnly()`/`@RequirePermission` **and**
`@SessionOnly()`, and `ApiKeysService` refuses an API-key principal a second
time itself.

**Oversight reuses `users.manage`** rather than adding a permission. Its holder
can already deactivate a back-office account outright, which revokes every key
that account has; revoking one key is strictly narrower. Over customer keys it
is a small, protective widening — revoke and read metadata, never a secret and
never the customer's data — and it keeps the capability on a permission that is
already non-delegatable and already granted to the Admin role, so there is no
new key to seed through `seedRoles()`'s one-time backfill (ADR-031 §2's trap).

**Revocation is final at the database.** A trigger refuses any update to a
revoked row except the `revokedById → NULL` that `ON DELETE SET NULL` performs
when the revoking person's own account is erased. A revoked key cannot be
un-revoked, re-keyed or re-scoped by any code path, present or future.

### Audit — evidence class

Creation, rotation, scope edits and revocation change what a credential may
do, so they are evidence-class under canonical ruling 9: the `AuditLog` row is
written **inside the same transaction** as the change, and a failed audit write
fails the act. `api_key.scopes_changed` carries the old and the new scopes, not
a list of changed fields. Honest limit: `AuditLog` itself is not yet immutable
(ruling 1's prerequisite migration), so this trail is transactional, not
tamper-evident. `lastUsedAt` is operational, best-effort, and never fails a
request.

### The security notice

Every time a secret is issued — create or rotate — `DomainEvent.ApiKeyIssued`
goes into the outbox in the same transaction, and
`SecurityNotificationSubscriber` mails the owner (`user.api_key_issued`, en and
ur). It is the one control that makes the persistence attack visible: someone
who briefly holds a session mints a key to keep access after the password is
changed. The mail names the key by its last four characters and surface —
never by its name, which is text the minting person chose and has no place in a
trusted message.

---

## 6. Surfaces

| Surface | Screen | Reached from |
|---|---|---|
| Admin, own keys | `/admin/account/api-keys` — **My API keys** | nav: Settings › My API keys; the **My account** page |
| Admin, oversight | `/admin/users/api-keys` — **API keys** | nav: Settings › Team & Access › API keys (`users.manage`) |
| Storefront, own keys | `/account/api-keys` — **API keys** | the account nav; en and ur |

The same concept sits in the same place on both surfaces — under the person's
own account (`NAV-12`). The admin picker offers only what the person holds and
may delegate, grouped by `PERMISSION_GROUPS`; what they hold but may never
delegate is listed behind a disclosure with its reason (`PRM-2`: disable and
explain, never silently hide). The storefront picker is one control per
resource — no access / read / read and write — and hides resources whose module
is off (`MOD-1`). The secret is shown once, with a copy action and a plain
warning, and never again.

Using a key: `Authorization: Bearer <key>` on any API request, exactly where a
session token would go.

---

## 7. Implementation plan

### Objective
Personal, permission-scoped API keys on the admin and storefront APIs, capped
live by their owner's access, with a non-delegatable list, a customer scope
catalogue, full lifecycle, oversight, audit and reachable UI.

### Existing state
`JwtAuthGuard` + `PermissionsGuard` are global and re-resolve a session's
permissions per request. Three key-hash credentials exist (`TradingPartner`,
`Node`, `PosTerminal`), each on `@Public()` routes that verify their own key.
Nothing lets a key stand in for a user. Doc 34 designed an org-level `ApiClient`
that survives its creator — the design the owner has now deferred.

### Required change
Schema + migration; shared catalogue and pure functions; key authentication in
`JwtAuthGuard`, fail-closed authorisation in `PermissionsGuard`; lifecycle
service and two controllers; `@CustomerScope` on the fourteen scopes' routes;
`@SessionOnly` on credential routes; revocation in the deactivation
transaction; the security notice; three screens with nav entries; tests;
this document, ADR-037, doc 34's status note.

### Files likely affected
`apps/api/prisma/schema/core.prisma` and one migration;
`packages/shared/src/api-keys.ts` (+ spec, + index export);
`apps/api/src/core/auth/{auth.constants,decorators,guards,auth.module}.ts`,
`apps/api/src/core/auth/api-keys/*`; the controllers named in §2 and §4;
`users-admin.service.ts`; `core/events/domain-events.ts`;
`core/notifications/email/{copy,templates,catalog}.ts`;
`modules/users/security-notification.subscriber.ts`; three web pages, the nav
registry, the account nav, routes, types, messages (en, ur).

### Dependencies (existing capabilities reused)
`generateApiKey`/`hashApiKey`; `PermissionsResolverService.resolveForUser`;
`EventBusService.publish(…, tx)`; `PaginationQueryDto`/`paginated()`;
`NotificationsService`; `DataTable`, `Dialog`, `ConfirmDialog`, `PageHeader`,
`Section`, `EmptyState`, `Disclosure`, `FilterBar`, `Pagination`. No new
dependency.

### Risks
A guard change touches every request: the JWT path must stay byte-for-byte
identical when no API-key prefix is present (tested). A route that should be
reachable by keys but was not given a scope fails closed — safe, and fixed by
adding the scope. A credential route added later without `@SessionOnly()` is
the residual risk; the security rule and the spec are the guard.

### Acceptance criteria
1. A key's effective permissions never exceed its owner's live permissions;
   demoting the owner shrinks it on the next request; deactivating the owner
   revokes it in the same transaction.
2. A non-delegatable permission is refused at create and at edit, and stripped
   at request time even if a row already carries it.
3. A revoked key is refused on its very next request; the database refuses to
   un-revoke it.
4. An admin key reaches only `@RequirePermission` routes it carries; a
   storefront key only `@CustomerScope` routes it carries; neither reaches a
   route with no capability, a `@SessionOnly()` route, or the other surface.
5. Rotation issues a new secret, keeps the scopes, and kills the old secret.
6. Create/rotate/edit/revoke each leave an in-transaction audit row; the edit
   row carries old and new scopes.
7. The secret appears only in the create/rotate response; no read path selects
   `keyHash`.
8. Three screens, each with a nav entry, the storefront one in en and ur.
9. `pnpm lint && pnpm typecheck && pnpm test` clean at the root.

### Out of scope
Service accounts / org-level `ApiClient` (doc 34, ADR-037). An order-placement
customer scope (its own work order, with a grant-time toxic-pair refusal).
Per-key rate limits (the global `ThrottlerGuard` applies to key requests
exactly as to sessions). IP allowlists per key. Mobile-app screens (a key is
pasted into an agent or script — a desktop task; the storefront page works on a
phone browser). A user-erasure flow (none exists in this codebase yet; §7's
erasure lens names what it must do with these rows).

### Scope lenses
The transaction, start to finish — sign in → `/admin/account/api-keys` or
  `/account/api-keys` → pick scopes → copy the secret once → the integration
  sends `Authorization: Bearer nxa_…/nxs_…` → `ApiKeyAuthService` resolves
  (owner, live-capped scopes) → rotate / edit / revoke from the same screen.
The other side of the same transaction — the `users.manage` oversight list,
  `/admin/users/api-keys` (`GET /admin/api-keys`, `POST /admin/api-keys/:id/revoke`),
  read and revoke only.
What happens after "done" — expiry (`ApiKey.expiresAt`, NOT NULL, ≤365 days),
  rotation (`ApiKeysService.rotate`), revocation (`revoke`,
  `revokeAsAdministrator`), owner deactivation (`revokeAllForUserInTransaction`),
  and the `user.api_key_issued` security mail on every issued secret.
The integrations a real business needs, not a demo — a standard bearer
  credential on the existing API, usable from any HTTP client or MCP server,
  on both surfaces, with no SDK and no new endpoint shape.
The policy layer that governs it — `NON_DELEGATABLE_PERMISSIONS`,
  `CUSTOMER_SCOPE_CATALOG`, `API_KEY_MAX_LIFETIME_DAYS`,
  `API_KEY_MAX_ACTIVE_PER_SURFACE` in `packages/shared/src/api-keys.ts`, and
  `@SessionOnly()` on credential routes; all code, changed only by a reviewed
  commit — no runtime `Setting` can widen them.
The actor with three tables — `User` (the owner, `ApiKey.userId`) and the new
  key-hash credential `ApiKey`; no `Party`/`Contact`/`TradingPartner` link,
  because a personal key is its owner, not a new counterparty.
The principal with no permission key — n/a as a separate principal: an ADMIN
  key is checked against `PERMISSION_CATALOG` keys by the same
  `PermissionsGuard`, a STOREFRONT key against `CUSTOMER_SCOPE_CATALOG` via
  `@CustomerScope`; both read only their owner's rows.
The grant that ends itself — `ApiKey.expiresAt`; the live intersection in
  `ApiKeyAuthService.authenticate()` (demotion ends access on the next
  request); `UsersAdminService.update()`'s deactivation transaction now
  revokes every live `ApiKey` (revokedReason `OWNER_DEACTIVATED`) beside the
  `RefreshToken` revocation it already did, with an `AuditLog` row per key.
Whose rows, and which columns — the owner lists only `ApiKey.userId = self`;
  `users.manage` lists every row; no read path selects `keyHash`; a key's
  effective set flows into every existing column check that reads
  `user.permissions` (`stripOrderCost`), and its row reach is its owner's
  `AdminScope` rows.
The threshold nobody approves alone — n/a: a key never exceeds its issuer's
  own live grant, so there is no amount a second person would approve that the
  owner cannot already do; doc 34's second-approver threshold belongs to the
  deferred `ApiClient`, whose authority is not bounded by one person.
The toxic pair, caught at grant or at act — admin: none beyond the
  non-delegatable list, because a personal key carries its owner's `userId` and
  every existing maker≠checker comparison sees the same person on both sides;
  storefront: `addresses:write` + an order-placement scope would be one, which
  is why checkout is not in `CUSTOMER_SCOPE_CATALOG` — a future `orders:write`
  must add the refusal to `ApiKeysService.validateScopes()`.
Authority and blast radius — the lists are code; the worst an owner can set is
  every delegatable permission they hold for 365 days, still capped live; the
  worst `users.manage` can do is revoke; `api_key.scopes_changed` audit rows
  carry `from` and `to`.
Audience is a capability, not an address — the one message,
  `user.api_key_issued`, goes to the key's owner resolved from `ApiKey.userId`
  (the same audience `PasswordChanged` uses); an owner with no email is
  skipped; there is never more than one recipient.
Request or record — key-lifecycle writes are REQUESTS (refused on a
  non-delegatable or unheld permission, the active-key cap, a revoked key); a
  request made *with* a key is classified exactly as the same request from a
  session — an order changed through a key is the same REQUEST; `lastUsedAt` is
  a best-effort RECORD that never refuses anything.
The movement with no address — n/a: writes no stock or cash; a stock or cash
  write made through a key carries whatever `locationId` its module already
  requires, unchanged.
Four hours down, the counter stays open — an integration's request fails and
  it retries on its own schedule; no fact is lost, because a key only
  authorises requests. No till uses a personal key; keys are node-local, so a
  branch node verifies keys minted on it while the central node is down.
The unwritten posting rule — n/a: posts no journal entry; writes made through a
  key post under their own module's existing rule.
Every column or none — n/a: writes no `JournalLine`.
The period that already moved — n/a: writes nothing dated into a `FiscalPeriod`.
The second legal entity — n/a: issues no tax document and no numbered series;
  a second `RetailBrand`'s staff mint keys bounded by their own `AdminScope`.
Dry run before live — `effectiveApiKeyPermissions()` and
  `decideApiKeyAccess()` are pure (no `prisma.` write, no `publish(`);
  `effectiveApiKeyPermissions()`'s second, read-only caller is
  `ApiKeysService.listMine()`, which shows each key's live and paused scopes.
Click the number — each key's "N permissions · M paused" opens the key and
  lists exactly those N and M; both come from the one
  `effectiveApiKeyPermissions()` call.
Three silhouettes, and the day the tier above appears — no tier column: a key
  has no scope of its own, only its owner's `AdminScope` rows resolved live, so
  the day a brand or org tier appears above, every existing key is bounded by
  it on its next request; Solo sees one page per surface and nothing else.
The absent collaborator — the security mail's subscriber lives in `users`
  (always on); with only the LOG channel the event is still recorded in the
  outbox; a scope whose module is off grants nothing (its routes are not
  mounted) and the storefront picker hides it.
The second copy of the write — a retried create makes a second key whose secret
  reached no one (inert; it expires or the owner revokes it); a retried rotate
  leaves the last secret live; revoke and deactivation are predicate-on-write
  (`revokedAt IS NULL`) no-ops the second time; `ApiKey.keyHash @unique`.
The hundred-thousandth row — bounded at 20 live keys per owner per surface;
  authentication is one unique-index lookup plus the same two permission
  queries a session costs; the owner's list reads `(userId, createdAt)`, the
  oversight list `(createdAt)`, both paginated; `lastUsedAt` is written at most
  once a minute per key.
The adoption test — n/a: invents no sequence or human-readable number; the one
  generated string is 256 random bits, unique by `keyHash @unique`, and never
  leaves the node that minted it (`ApiKey` is not registered with
  `ReplicationRegistry`).
The reversal document, not the reversal flag — revocation is the reversal and
  it is terminal (`revokedAt`, `revokedReason`, `revokedById` on the row,
  immutable by the `api_key_revocation_is_final` trigger); the partial reversal
  is narrowing scopes with `PATCH /api-keys/:id`, repeatable, each audited
  old→new.
The undo fan-out — create writes an `ApiKey` (reversed by `revoke()`), an
  `AuditLog` row (deliberately irreversible — evidence), and an `ApiKeyIssued`
  outbox event whose mail is deliberately irreversible; requests already made
  with a key stand on their own authorisation at the time; reactivating an
  owner needs a human — they mint new keys from their own screen.
The version stamp — no version column by design: the rule is re-applied on
  every request (decision 1), so a key's access is explained by its stored
  `permissionKeys`/`customerScopes` plus the running lists, and every change to
  those stored scopes is an audit row with `from` and `to`.
The erasure the ledger cannot obey — `ApiKey`: cascade with its `User` (a
  credential has no ledger value); `ApiKey.revokedById`: set null (an edge; null
  after the revoking person's erasure, `revokedReason` still says which kind of
  actor); `AuditLog` rows about keys and the `ApiKeyIssued` outbox payload
  (ids, surface, last four — no name): canonical ruling 1's existing disposition.
  No erasure flow exists in this codebase yet; this is what it must do here.
The failure path, and who is allowed to walk it — a dead key gets a 401 naming
  why (revoked / expired / owner inactive / not valid) and a `warn` log with the
  key id, never the secret; twenty failures in a minute from one address get a
  429 and a `warn` naming the address, with no further lookups until the
  window passes (`API_KEY_FAILURE_LIMIT`); the owner sees the status on their list; a failed
  security mail becomes a `FAILED` `OutboxEvent` after `OutboxDispatcher`'s
  eight attempts, counted by `GET /health/ready`, with no replay screen today.
  One gap this feature inherits and does not close: `OutboxDispatcher` never
  reclaims a stale claim. A notice claimed by a process that stops mid-batch
  (a deploy, a crash) stays `PROCESSING`: never delivered, and not counted by
  `/health/ready`, which counts only `PENDING` and `FAILED`. The e2e suites
  showed it, stranding rows when an app closed during a batch. The fix belongs
  to the dispatcher, for every event, not to this feature: a lease on
  `PROCESSING` rows that is reclaimed when it lapses, and the in-flight batch
  finished before `PrismaService` disconnects on shutdown.

---

## 8. Verification

Where the code lives: `apps/api/src/core/auth/api-keys/` — part of the `auth`
core subsystem, registered in `AuthModule` (which is `@Global`), not a module
of its own, because `JwtAuthGuard` is an `APP_GUARD` and must inject
`ApiKeyAuthService`, and `UsersAdminService` must reach
`ApiKeysService.revokeAllForUserInTransaction()` inside its own transaction.

| Spec | What it proves |
|---|---|
| `packages/shared/src/api-keys.spec.ts` | the lists name real catalogue keys; every lockout-critical key is non-delegatable; the intersection never exceeds the owner and strips a non-delegatable key a row already carries; write ⇒ read; prefixes never collide with a JWT or another credential |
| `apps/api/src/core/auth/api-keys/api-key-access.spec.ts` | the route decision, every branch, and that a handler's metadata overrides its controller's |
| `apps/api/src/core/auth/api-keys/api-key-auth.service.spec.ts` | revoked / expired / inactive owner / unknown / surface mismatch each refused; the owner re-resolved on every request (demotion shrinks the next one); the secret never logged; `lastUsedAt` at most once a minute and never failing a request; an address locked out with a 429 and no lookup after 20 failures, other addresses untouched, successes never counted, the window expiring |
| `apps/api/src/core/auth/api-keys/api-keys.service.spec.ts` | every refusal at create and edit; the secret returned once and stored only as its hash; evidence-class audit and the security notice inside the transaction; rotation never widens and exactly one of two concurrent rotations wins; revoke idempotent; the active cap; deactivation revokes exactly the rows it changed |
| `apps/api/src/core/auth/guards.spec.ts` | the JWT path unchanged; key recognition; a dead key refused on a public route; a key personalises a public route only when it holds the route's capability; both surfaces through `PermissionsGuard` |
| `apps/api/test/session-only-routes.spec.ts` | `@SessionOnly()` on every credential route in §2 |
| `apps/api/test/customer-scope-routes.spec.ts` | every route in §4 declares its scope; every left-out route declares none; every catalogue scope is declared somewhere; a sweep of every controller finds no scoped route missing from §4, inherited scopes included, and no state-changing route accepting a `read` scope |
| `apps/api/src/modules/users/users-admin.service.spec.ts` | deactivation revokes keys in the same transaction; a role change does not; a failed revoke fails the deactivation |
| `apps/api/src/core/notifications/email/templates.spec.ts` | the `user.api_key_issued` notice in both languages, linking to the right surface |
| `apps/api/test/api-keys.e2e-spec.ts` | through the real global guards and database: a key reaches only its own permission's routes; fail-closed on signed-in-only routes; never manages keys; a demotion shrinks a live key and the returning grant resumes it; rotation kills the old secret; a revoked key is refused on the very next request; the `api_key_revocation_is_final` trigger refuses an un-revoke and a re-scope; the `CHECK`s refuse a row with both catalogues, with none, or revoked without a reason; a storefront key cannot change the sign-in identity; oversight lists and revokes; deactivation revokes and reactivation does not revive; guessed keys from one address end in a 429 while a session from that address still works |

---

## 9. Deferred: service accounts

A principal that survives its creator — an "App" or service account owned by
the organisation rather than a person — is **not built**, by the owner's
decision (ADR-037). Doc 34's `ApiClient` is that design and stays the starting
point. What it will have to answer that a personal key does not:

- **Whose live permissions cap it.** A personal key is capped by one person's
  current grants; a service account has no person, so it needs its own grant
  set and its own `PermissionsGuard` resolution.
- **Who approves it.** Doc 34's second-approver threshold exists because an
  org-level key's authority is not bounded by any one human's.
- **Maker-checker.** A personal key carries its owner's `userId`, so every
  existing `approvedBy ≠ createdBy` comparison treats it as its owner. A
  service account is a distinct actor and every such check must decide
  whether it may be the second person.
- **Offboarding.** It must not die with whoever created it — which is the whole
  reason it is a different design.
