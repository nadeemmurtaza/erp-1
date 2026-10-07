# ADR-037 — Personal API keys: a user-bound token capped live by its owner, an explicit non-delegatable list, and no service account yet

[← Decision log](../DECISIONS.md)


### Context
The owner asked for API keys a signed-in person can hand to an AI agent, a
script or an integration without handing over their account — GitHub
fine-grained PATs, Cloudflare API tokens — on the admin API and on the
customer's own storefront API. Doc 34 (`34-partner-developer-api-access.md`)
had already designed an organisation-level `ApiClient` that survives its
creator. Three questions decided the architecture, and the owner answered each
directly. Long-form: `access-control-identity/163-personal-api-keys.md`.

### Options Considered
1. **Actor.** (a) A personal token owned by a `User`, its effective access
   `scopes ∩ owner's live permissions` recomputed per request; (b) a service
   account / `ApiClient` principal with its own grant set that outlives its
   creator (doc 34); (c) both at once.
2. **What can never be delegated.** (a) Reuse `PermissionDefinition.sensitivity`
   (e.g. "nothing `high` or above"); (b) a separate, short, hand-maintained
   list with a reason per entry.
3. **Surface.** (a) Admin API only; (b) admin and storefront, sharing one
   lifecycle but with two scope catalogues and two guard integration points.

### Decision
**1(a), 2(b), 3(b).** A personal token, now; service accounts are deferred and
doc 34 keeps their design. `NON_DELEGATABLE_PERMISSIONS`
(`packages/shared/src/api-keys.ts`) lists `roles.manage_permissions`,
`users.manage`, `organization.manage`, `settings.manage`, `pos.manage` and
`account.change_own_password`. A new `CUSTOMER_SCOPE_CATALOG` gives the
storefront fourteen scopes over routes that already exist. One `ApiKey` table
with one scope column per catalogue and a `CHECK` constraint tying each row to
exactly one. Both guards fail closed: a key reaches only routes that name a
capability of its own surface, and never a route marked `@SessionOnly()` —
every route that issues, rotates or installs a credential.

### Reasoning
- **Live intersection** makes offboarding need no memory: demote someone and
  every key they made shrinks on its next request; deactivate them and the
  deactivation transaction revokes every key (canonical ruling 6). A snapshot
  column would be a second grant table that silently goes stale.
- **Sensitivity is the wrong axis.** It measures how bad a wrong grant is, not
  whether a grant can widen itself. Refunds are `high` and legitimately
  delegatable; creating a user is `high` and must never be. The list's
  criterion is escalation — editing grants, minting a principal or credential
  that outlives the key, or taking over the account.
- **The permission list cannot catch everything.** `purchasing.manage` is fine
  to delegate but also gates minting a trading-partner credential, so the
  credential routes carry `@SessionOnly()` rather than the permission going on
  the list and taking purchase-order sync with it.
- **Fail-closed routing** means a route added tomorrow is unreachable by keys
  until someone grants it a scope, instead of reachable until someone
  remembers to exclude it.
- **Oversight reuses `users.manage`**: its holder can already deactivate a
  back-office account, which kills its keys; it is already non-delegatable and
  already granted to the Admin role, so there is no new permission to seed
  through `seedRoles()`'s one-time backfill (ADR-031 §2).

### Consequences
- A key can never be the "second person" in a maker-checker check — it carries
  its owner's `userId`. The deferred service account must answer that
  explicitly (doc 163 §9).
- Checkout is not in the storefront catalogue: an order-placement scope plus
  `addresses:write` would be a toxic pair; it is its own work order, with a
  grant-time refusal in `ApiKeysService.validateScopes()`.
- The residual risk is a future credential route written without
  `@SessionOnly()`; `.claude/rules/security.md` states the rule and
  `session-only-routes.spec.ts` pins today's routes.
- Lifecycle audit is written in-transaction (evidence class, ruling 9), but
  `AuditLog` is not yet immutable (ruling 1's prerequisite), so it is
  transactional, not tamper-evident.

### Status
**Accepted.** Service accounts: **deferred** — reopen by superseding this entry
when an integration must outlive the person who set it up.
**Partially superseded by ADR-073** — the service-account deferral only: an
installed third-party app is exactly an integration that must outlive the person
who set it up, so doc 34's `ApiClient` is now specified for completion (docs
187/189/193). Every personal-key decision above stands unchanged.
