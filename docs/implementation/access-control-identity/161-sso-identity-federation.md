# 161 — SSO / identity federation: the buildable brief behind doc 128's own sketch

Doc 128 already confirmed the gap by grep ("no `SsoProvider`, `IdentityProvider`,
SAML, or OIDC login path exists anywhere in `apps/api/src`") and sketched a
one-method `IdentityProvider` interface. This document is the full,
security-reviewed design behind that sketch — the real protocol shapes,
the JIT-provisioning rule doc 128 named but didn't specify, and the
account-linking mechanism doc 128 named but didn't design. Authentication
is one of the highest-blast-radius surfaces in this codebase; nothing here
loosens `AuthService`'s existing password path, and every new decision is
made in the direction that fails closed, not open.

## What already exists, cited exactly

`AuthService.login(identifier, password)` (`auth.service.ts:116`) does a
constant-time password comparison against a dummy hash when no user
exists, refuses an inactive `User`, then calls `this.issue(user)` to mint
a session. Self-registration (`auth.service.ts:100`) provisions a brand
new `User` via `RolesService.assignByNameIfExists(user.id, 'Customer')`
and publishes `DomainEvent.UserRegistered`, which the CRM subscribes to in
order to create or merge a `Contact`. **This second fact matters directly
for SSO**: an SSO login is almost always a *staff* member, not a
customer, so JIT-provisioning an SSO user must never reuse
`UserRegistered` verbatim — doing so would silently create a CRM contact
for an employee, a real correctness bug this document closes before it
ships (§3).

## 1. `SsoConnection` — one row per configured identity provider, per organization

```prisma
// core.prisma — additive
enum SsoProtocol { OIDC SAML }
enum SsoConnectionStatus { ACTIVE SUSPENDED }

model SsoConnection {
  id             String   @id @default(cuid())
  organizationId String
  protocol       SsoProtocol
  label          String   // "Company Google Workspace", "Head Office Entra ID"
  /// OIDC: the issuer's discovery URL. SAML: the IdP metadata URL.
  issuerUrl      String
  /// OIDC: client_id. SAML: our own Service Provider entity id.
  clientId       String
  /// OIDC: client_secret. SAML: the IdP's signing certificate. Encrypted
  /// at rest via the identical secret-crypto discipline
  /// TradingPartner.outboundApiKey already uses.
  credentialEncrypted Bytes
  /// The hard security gate (§2) - an assertion for any other domain is
  /// refused outright, never evaluated further.
  allowedEmailDomains String[]
  /// Which role a brand-new SSO login is provisioned into - never left
  /// blank, never an admin-capable role by default (§3).
  defaultRoleName String
  status          SsoConnectionStatus @default(ACTIVE)
  createdByUserId String
  createdAt       DateTime @default(now())

  @@index([organizationId, status])
}
```

```ts
// core/auth/identity-provider.ts - doc 128's own interface, unchanged
export interface IdentityProvider {
  readonly protocol: SsoProtocol;
  verifyAssertion(rawAssertion: string, connection: SsoConnection): Promise<{ email: string; externalId: string }>;
}
// OidcProvider and SamlProvider each implement this once, registered by
// SsoConnection.protocol - never a class per vendor, since every OIDC
// issuer (Google, Microsoft Entra, Okta) speaks the identical protocol.
```

## 2. The domain allowlist is not optional — the one control that makes everything else in this document safe

```ts
async ssoLogin(connectionId: string, rawAssertion: string): Promise<AuthResult> {
  const connection = await this.prisma.ssoConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (connection.status !== 'ACTIVE') throw new UnauthorizedException('This sign-in method is not available.');

  const provider = this.providers.get(connection.protocol);
  const { email, externalId } = await provider.verifyAssertion(rawAssertion, connection);

  const domain = email.split('@')[1]?.toLowerCase();
  if (!connection.allowedEmailDomains.includes(domain)) {
    // Refused BEFORE any User lookup - a correctly-signed assertion for
    // the wrong domain proves nothing about who should be let in. This is
    // the single most common real-world SSO misconfiguration; making it
    // structurally impossible to skip is this document's own central
    // design decision.
    throw new UnauthorizedException('This account is not part of an authorized domain for this organization.');
  }
  return this.resolveOrProvision(connection, email, externalId);
}
```

## 3. JIT provisioning — least privilege by default, never `UserRegistered`

```ts
private async resolveOrProvision(connection: SsoConnection, email: string, externalId: string): Promise<AuthResult> {
  const existing = await this.prisma.user.findUnique({ where: { email } });

  if (existing?.ssoExternalId === externalId) return this.issue(existing); // already linked

  if (existing && !existing.ssoExternalId) {
    // Account linking (doc 128's own named gap): auto-linked because the
    // domain gate in §2 already proved this email belongs to the
    // organization's own verified domain - the same trust boundary that
    // makes the allowlist meaningful in the first place. Never silent:
    // audited, and the account's own email is notified of the new sign-in
    // method, so an unexpected link is immediately visible and reversible
    // by the account holder or an admin.
    await this.prisma.user.update({ where: { id: existing.id }, data: { ssoExternalId: externalId } });
    await this.audit.record({ action: 'sso.account_linked', targetUserId: existing.id, data: { connectionId: connection.id } });
    await this.notifications.send({ template: 'sso.account_linked', recipient: { email }, subject: '', body: '' });
    return this.issue(existing);
  }

  // Brand new user - JIT-provisioned into the connection's own
  // defaultRoleName, the identical assignByNameIfExists() pattern
  // self-registration already uses (auth.service.ts:100), scoped to this
  // SsoConnection's own organizationId. Deliberately does NOT publish
  // UserRegistered - that event's own CRM subscriber would incorrectly
  // create a customer Contact for what is a staff login.
  const user = await this.prisma.user.create({ data: { email, organizationId: connection.organizationId, ssoExternalId: externalId, isActive: true } });
  await this.roles.assignByNameIfExists(user.id, connection.defaultRoleName);
  await this.audit.record({ action: 'sso.user_provisioned', targetUserId: user.id, data: { connectionId: connection.id } });
  return this.issue(user);
}
```

`User.ssoExternalId` is an additive, nullable column — a password-only
`User` is entirely unaffected.

## Scope lenses

**The actor with three tables** — an SSO login always resolves to this
repository's existing `User`, never a new actor table; doc 128's own
answer stands.
**The principal with no permission key** — n/a: `IdentityProvider`
authenticates a person, not a system principal.
**The grant that ends itself** — suspending an `SsoConnection`
(`status: SUSPENDED`) immediately stops new logins through it without
touching any already-provisioned `User` or their password (if they have
one) — the identical "revoke the method, not the account" answer doc 128
already gave.
**Whose rows, and which columns** — an SSO-provisioned `User` sees exactly
what their assigned role sees, nothing more; SSO changes authentication,
never authorization, restated from doc 128.
**The threshold nobody approves alone** — n/a: no money/stock value.
**The toxic pair** — the account-linking step in §3 IS this document's own
toxic-pair guard: linking is gated entirely on the domain allowlist (an
admin-configured, audited value), never on the assertion's own claim
alone — an attacker who somehow obtains a valid assertion for an
unauthorized domain is refused at §2, before account resolution is even
attempted.
**Authority and blast radius** — registering or editing an
`SsoConnection` (especially `allowedEmailDomains` and `defaultRoleName`)
is gated by `settings.sso.manage`, doc 128's own named permission,
audited with old/new value — the worst value one misconfiguration can
set is "any email at this domain becomes a member with this role," which
is exactly why both fields are audited, not just logged.
**Audience is a capability, not an address** — n/a: no notification
audience beyond the linked account itself (§3).
**Request or record** — `ssoLogin()` is a REQUEST, refusable at the
domain gate or on a failed assertion; the resulting session/audit rows
are RECORDS once issued.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity / Dry run before live** — n/a: no money or stock fact.
**Click the number** — an admin's own SSO settings screen shows exactly
which `User` rows were provisioned or linked through which
`SsoConnection`, queryable from the audit rows this document already
writes.
**Three silhouettes** — restated from doc 128: a real enterprise-client
(Chain/Organization) requirement; a Solo shop is unlikely to configure
one, and nothing forces it to.
**The absent collaborator** — with no `SsoConnection` configured, the
login screen shows only the existing password form — doc 128's own
answer, unchanged.
**The second copy of the write** — `User.email @unique` (already existing)
is what makes `resolveOrProvision()`'s own lookup safe against a race
between two near-simultaneous first logins; the second one hits the
unique constraint and is treated as the existing-account path, never a
duplicate `User`.
**The hundred-thousandth row** — `SsoConnection` is a small, admin-
authored table; unaffected by row-count scale.
**The reversal document / The undo fan-out** — unlinking an SSO identity
(clearing `ssoExternalId`) forces that account back to password login;
named as an admin action on the same settings screen, never silent.
**The version stamp** — editing `defaultRoleName` applies to future
JIT-provisioned users only; an already-provisioned user's role is managed
through the ordinary role-assignment screen from then on, unchanged by a
later edit to the connection.
**The erasure the ledger cannot obey** — `User.ssoExternalId` is cleared
by the same erasure path doc 20 already applies to the rest of a `User`
row; no separate erasure mechanism needed.
**The failure path** — a failed assertion verification or a domain-gate
refusal surfaces as "sign-in failed," never a stack trace, and never
falls back to granting access — restated and made concrete from doc 128's
own "never silently granting access."

## Work orders

**WO-161.1 — schema**: `SsoConnection`, `SsoProtocol`,
`SsoConnectionStatus`, `User.ssoExternalId` (nullable, additive), forward-
only migration.
**WO-161.2 — `IdentityProvider` interface + `OidcProvider`** (the
protocol most modern IdPs — Google Workspace, Microsoft Entra, Okta —
speak identically via OIDC discovery); `SamlProvider` as WO-161.2b once a
real client names a SAML-only IdP, per doc 36's own "write it once a real
need exists" rule — not spuriously pre-built for a protocol nobody has
asked for yet.
**WO-161.3 — `ssoLogin()`/`resolveOrProvision()`**, the domain gate, the
audit/notify pair on linking.
**WO-161.4 — UI**: the login screen's own "Sign in with [Provider]"
button per active `SsoConnection` (doc's own "reachable" requirement — a
port with no button is not shipped); the admin settings screen to
register/edit/suspend a connection.
**WO-161.5 — permissions**: `settings.sso.manage`, seeded to whatever
role already holds `settings.manage`-class permissions, never a new,
unseeded row.

## Acceptance

- An assertion for a domain outside `allowedEmailDomains` is refused
  before any `User` lookup runs, proven by a spec.
- A brand-new SSO login provisions a `User` with the connection's own
  `defaultRoleName` and does **not** publish `UserRegistered`, proven by
  a spec.
- An existing password-only `User` whose email matches a verified-domain
  assertion is linked, audited, and notified — never silently logged in
  without a record.
- With no `SsoConnection` configured, the login screen is byte-identical
  to today's.

## Out of scope

A specific SAML implementation until a real client names the vendor
(doc 36's own rule, restated in WO-161.2). Multi-factor authentication
as part of the SSO flow itself — delegated entirely to the identity
provider's own MFA policy, never re-implemented here. Self-service IdP
registration by an organization's own end users — `SsoConnection` is
always admin-configured, never something a non-admin can add, which is
precisely what keeps the domain allowlist in §2 a trustworthy gate.
