# ADR-043 — `access-control-identity` docs 126/161 built; 16/18/163 re-verified; 125 corrected; 21 reported blocked on missing docs 19/20

[← Decision log](../DECISIONS.md)


### Context

The `docs/implementation/access-control-identity/` folder's seven
documents were pulled and checked against the running codebase, in the
same discipline this file's own ADR-025/ADR-033 established. Three were
already fully built and verified unchanged (`16` PBAC row scoping, `18`
identity verification via nID, `163` personal API keys — ADR-037). One
(`125`, zero-trust networking) had already been decided closed by
ADR-026/ADR-027 with no work orders, but its own illustrative citations
(doc 36's `OutboundConnector`, doc 113's embed-token pattern) turned out
to name two documents that are themselves still unbuilt — a real,
if narrow, drift between a doc's prose and the running code, the same
failure mode ADR-025/ADR-033 found in the opposite direction. Two
(`126` pluggable cryptography, `161` SSO/identity federation) named real,
buildable gaps. One (`21`, access over the org tree) turned out to depend
entirely on two sibling documents (`19` org structure, `20` people/
positions/ranks) that carry zero code and no status note between them —
a genuinely separate, large HR-org-tree subsystem, not a gap this batch
could close in passing.

Given the security stakes of the two buildable documents — one touches
every password check in the system, the other adds a second way to
authenticate as any staff account — their implementation was delegated to
a security-focused review pass rather than written at this session's own
default effort, per this repository's own model-routing table
(`docs/index/cross/model-routing.md`: "Access control, isolation and
money → opus at max effort"). The orchestrating session did full
reconnaissance first (every call site, every existing pattern to mirror)
so the brief handed over was a resolved design, not an open question, and
reviewed every file line by line before it shipped.

### Decision

**Doc 125** — corrected, not rebuilt. Its central claim
(`JwtAuthGuard`/`PermissionsGuard` enforcing every request with no
"trusted internal network" assumption) re-verified true against the
running code. Its two illustrative citations were replaced with real,
already-built examples of the identical principle:
`TradingPartner.outboundApiKeyEncrypted` and doc 163's own personal API
keys.

**Doc 126 (WO-126.1)** — `bcryptjs` wrapped behind a `PasswordHasher`
interface (`apps/api/src/core/auth/password.util.ts`), extending the
file's own existing "one place a plaintext password becomes a stored
hash" rather than forking it. `BcryptPasswordHasher` (`version:
'bcrypt-v1'`) is the only registered implementation; a hash's own format
prefix (`$2…`) identifies which hasher wrote it, so a future
`argon2id-v1` entry (WO-126.2, deferred — no current reason names one)
needs to reinterpret nothing already written. `verifyPassword()` replaced
two direct `bcryptjs` `compare()` calls in `auth.service.ts`, the
constant-time `DUMMY_HASH` comparison included; `hashPassword()` kept its
exact signature, so neither `users-admin.service.ts`'s two call sites nor
any existing test needed to change.

**Doc 161 (WO-161.1–161.5)** — a full OIDC authorization-code sign-in.
`SsoConnection` (new `sso.prisma`) holds one admin-registered identity
provider per row — more than one is allowed, since a deployment (this
codebase's real tenant boundary, per ADR-040) may have more than one.
`OidcProvider` (`openid-client` 5.7.1) runs real discovery, PKCE, and
ID-token verification, and refuses outright a templated or multi-tenant
issuer path (`/common/`, `/organizations/`, `/consumers/`) — a discovery
document that would accept a token from any tenant of that provider, not
just the one configured. `SsoService` enforces the domain allowlist
before any `User` lookup, then resolves an existing account, links one at
a verified domain (audited via `AuditService.recordEvidence`, and mailed
through a new `SsoAccountLinked` domain event so an unexpected link is
never silent), or JIT-provisions a new one into a role checked against
`NON_DELEGATABLE_PERMISSIONS` — so a connection's own `defaultRoleName`
can never grant admin capability, checked both at configuration and again
at every provisioning in case the role changed underneath it. An
open-signup email domain (gmail.com and its siblings) is refused as an
allowed domain at configuration, closing the one misconfiguration a shop
whose staff use personal mailboxes would most plausibly make.
`settings.sso.manage` is critical, `NON_DELEGATABLE_PERMISSIONS`, and
`@SessionOnly()` — installing a client secret must never be reachable by
a personal API key, per `.claude/rules/security.md`'s own rule for a
credential-affecting route. WO-161.2b (a `SamlProvider`) is deliberately
unbuilt — no real client has named a SAML-only provider yet.

**Doc 21** — reported blocked, not stubbed. `OrgUnit`/`Posting` (docs 19/
20) do not exist anywhere in this schema; doc 21's own text depends on
both for its `OrgUnitGrant`/`scopeFilterFor()` extension and its
`outranks()` countersignature rule. Building it now would mean silently
absorbing docs 19 and 20's own, much larger, unscoped HR-org-tree work
into this batch — exactly the "separably larger capability silently
built in" CLAUDE.md's own scoping discipline forbids. Named here as its
own future work order instead.

### Deviations from doc 161's own literal schema/interface sketch

- **No `organizationId`** on `SsoConnection` — this codebase's real
  multi-tenancy boundary is the deployment itself, matching
  `receivables.prisma`'s and (this same batch's own) settlement schema's
  identical reasoning; `Organization` here is the optional multi-brand
  grouping inside one deployment, not a tenant.
- **`credentialEncrypted` is `String`, not `Bytes`** —
  `encryptSecret()`/`decryptSecret()` (`@newax/shared/secret-crypto`)
  already return the `iv:authTag:ciphertext` base64url string every other
  encrypted-at-rest column in this schema uses
  (`TradingPartner.outboundApiKeyEncrypted`).
- **`IdentityProvider` gained a second method.** The doc's own (and doc
  128's own) one-shot `verifyAssertion(rawAssertion)` assumed the
  assertion is already in hand; a real browser-redirect OIDC flow has two
  steps — sending the browser to the provider, and completing the code
  exchange when it returns — so the interface has exactly those two:
  `buildAuthorizationUrl()`/`handleCallback()`.
- **No token ever appears in a URL, not even a fragment.** The callback
  seals the session it just issued into a two-minute, encrypted, httpOnly
  cookie scoped to `/api/v1/auth/sso`; the admin app's own
  `/admin/login/sso-complete` page redeems it once through `POST
  /auth/sso/session`, returning the identical `AuthResult` a password
  sign-in does, stored the identical way. This is stricter than the
  fragment-based handoff the orchestrating session's own brief proposed —
  a fragment never reaches a server, but still transits the browser's own
  history and any extension reading the URL; a sealed cookie the page
  never reads avoids that entirely.

### Consequences

- `openid-client` (5.7.1, pinned to the CJS-compatible 5.x line — 6.x is
  ESM-only and this API is CommonJS) is a new dependency, recorded per
  `.claude/rules/dependencies.md`'s own template in the provider file's
  header comment: no existing library in this codebase verifies another
  party's rotating RS256 keys, and hand-writing JWKS fetch, key rotation
  and the dozen ID-token claim checks is exactly the security-critical
  protocol code that must not be written by hand.
- A full end-to-end test (`apps/api/test/sso.e2e-spec.ts`) runs the real
  app against a real (loopback) OpenID provider implementing discovery,
  JWKS, PKCE and RS256 signing — `openid-client` runs every check it
  would run against Google or Microsoft Entra. It is the acceptance proof
  for every criterion doc 161 itself names: the domain gate refusing
  before any lookup, JIT provisioning never publishing `UserRegistered`,
  linking audited and mailed, CSRF refused, an unverified email refused,
  a suspended connection refusing outright.
- `settings.sso.manage` hit this codebase's own already-tracked
  `seedPermissions()`-vs-`seedRoles()` trap on this repository's local
  scratch database specifically: `seedRoles()`'s one-time `RolePermission`
  → `RoleGrant` migration had already run here (2026-09-25, before this
  permission existed), so a fresh `RolePermission(ADMIN)` row from
  `seedPermissions()` never reached a real `RoleGrant` — confirmed by
  querying both tables directly. Backfilled with the one `RoleGrant` row
  `seedRoles()` itself would have written had it run after this permission
  existed, per ADR-031 §2's own accepted "one-time, never re-synced"
  design — no seed-script or architecture change. A fresh deployment, or
  one whose `seedRoles()` migration has not yet fired, needs no such step;
  an already-migrated one adding any new permission always will, which is
  this trap working exactly as ADR-031 §2 already decided it should.
- Docs 19/20/21 remain a named, scoped-but-unbuilt HR-org-tree body of
  work — this ADR does not close that gap, it documents why this batch
  could not close it without silently absorbing a much larger, separately
  scoped feature.

### Status
**Accepted.**
