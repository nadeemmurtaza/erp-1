# ADR-073 — Third-party apps (docs 184–195): an open, reviewed directory of remote services — never in-process code — installed per tenant with consent onto doc 34's `ApiClient`, completed now; ADR-037's service-account deferral superseded

[← Decision log](../DECISIONS.md)


### Context
The owner asked for a system where any tenant can connect to any external
partner it chooses, compared directly to "apps in GitHub" — GitHub Apps and
GitHub Marketplace. That means any outside developer or company can build an
app, submit it for review, and any tenant can discover it and install it in one
step, on a consent screen naming exactly what it is granted. NEWAX building
integrations itself is not the ask. The platform is built for more than 50,000
tenants' financial and operational data (`PRD.md`), so how an outsider's app
reaches that data is the decision.

The repository already has an in-process extension mechanism: module packs
(`apps/api/src/modules/module-packs.ts`, `SDK-CONTRACT.md`,
`example-hello-world-pack`, doc 37 §3), for NEWAX's own sector packs and a
vetted client's bespoke pack committed through NEWAX's repository and review.
It also has two relevant deferrals. Doc 34's `ApiClient` — an
organisation-level principal that survives its creator — was deferred by
ADR-037 "until an integration must outlive the person who set it up". Doc 36's
Out of scope named "a connector marketplace/catalogue of pre-built
integrations" as a natural future layer. Long-form: docs 184–195 in
`docs/implementation/integrations-connectivity/`.

### Options Considered
1. **Open the in-process module-pack mechanism to third-party submission.** It is
   the only mechanism that lets an app change behaviour anywhere. Rejected:
   code in the API process runs with the process's authority — every table,
   `APP_ENCRYPTION_KEY`, any service called directly past `PermissionsGuard`.
   No review makes an anonymous developer's code safe there: a reviewed
   version is replaced, a dependency is compromised after approval. ADR-027
   already withdrew a far narrower sandbox for "partner-authored formulas"
   over exactly this exposure. The same reasoning excludes browser-side
   federation of third-party JavaScript (doc 143) into the admin's
   authenticated origin.
2. **Remote-service-only apps over the connector, webhook and API-client
   plumbing this repository already specifies, completing doc 34.** An app runs
   on its publisher's infrastructure. NEWAX calls it (signed webhooks, provider
   calls through NEWAX-written adapters), and it calls NEWAX with a scoped,
   individually revocable credential checked by the existing guards.
3. **A separate third-party-integration microservice outside the modular
   monolith**, brokering all app traffic. Rejected: it contradicts ADR-001's
   deliberate modular monolith (`ENTERPRISE-SCALE.md`, `RETAIL-ERP.md`), adds
   a network trust boundary and a second place authorization is decided, and
   buys no isolation that is not already stronger elsewhere — tenants are
   isolated per database (doc 39, "a tenant is a node"), not per service.

Within option 2, four narrower choices were also taken on evidence:
- **Principal:** doc 34's `ApiClient` plus a login-disabled actor `User`, over
  extending personal keys (doc 163). A personal key is capped by and dies with
  one person — the opposite of an installed app. A bare `ApiClient` id in
  `request.user.id` would violate the 75 `User` foreign keys every attributed
  write sets. Doc 170 §4.1 already chose the login-disabled `User` for the
  support session.
- **Event delivery:** a per-subscriber `OutboxDelivery` layer fanned out by the
  existing outbox, over an HTTP call inside an `@OnDomainEvent` listener.
  `OutboxDispatcher` retries a whole event for every listener, delivers
  sequentially, and gives up after 8 attempts, so one app would stall or lose
  events for all. `TradingPartnersService.pushOutbound()` is that anti-pattern
  already, swallowing failures while doc 18 §18.3 says otherwise.
- **Credential:** short-lived tokens minted with the publisher's private key,
  over a long-lived per-tenant secret held at the app.
- **Kill switch:** a public, pulled, append-only status feed, over a platform
  push. `apps/platform` has no outbox (ADR-059), and doc 39 requires that a
  tenant need no code awareness of the control plane.

### Decision
**Option 2.** A third-party app is always a remote service, and nothing from
any app ever runs in any NEWAX process. The directory (publishers, listings,
versioned manifests, review, reports, the status feed, installation records,
prices) lives in `apps/platform`'s own database. An installation (consent
evidence, topics, provider bindings, and its `ApiClient`) lives in the
installing tenant's own database. Specifically:

- Scopes are real `PERMISSION_CATALOG` keys, enforced by the same
  `PermissionsGuard`/`decideApiKeyAccess()`. `NON_DELEGATABLE_PERMISSIONS`
  gains `apps.manage`, `api-access.manage` and `api-access.approve_scope`. A new
  `API_CLIENT_EXCLUDED_PERMISSIONS` keeps every maker-checker "approve" key and
  `org.access.grant` off any non-person.
- Data scope is the whole node only until `ENTERPRISE-SCALE.md`'s L2
  branch-scoped reads are enforced.
- Webhook payloads are thin (ids and transitions), from an explicit
  `APP_EVENT_TOPICS` allowlist.
- A grant touching `medium`+ sensitivity needs a second approver, with ruling
  16's recorded fallback.
- A key or URL change needs the app's own well-known document to agree with
  the control plane.
- Paid apps are add-on lines on the one `PlatformInvoice`, billed in arrears.
- The private connectors (docs 36/132/160/162) and doc 34's service account
  remain the escape hatch for any partner without an app.

Rollout is gated (doc 195): core first, then NEWAX's own three apps
invite-only, then contracted partners, then paid apps, and only then public
publishers and revenue share.

### Reasoning
- **The boundary is the control.** Over HTTP an app can do exactly what its
  grant permits on exactly the tenants that consented, and the grant is
  enforced by code NEWAX wrote. In-process, no such bound exists.
- **Every piece reuses a precedent that is already built:**
  - `PermissionsGuard` and fail-closed `decideApiKeyAccess()`, `@SessionOnly()`,
    and `NON_DELEGATABLE_PERMISSIONS` (doc 163);
  - the transactional outbox, its backoff formula and `EventEmitter2.onAny()`
    (`TaskEventIntakeService`);
  - `CircuitBreakerService` (doc 38);
  - doc 166's ops-issued, hash-only publisher credential and its
    never-auto-applied flag;
  - `SupportAccessGrant`'s clock-bound grant that never trusts a cron for
    liveness;
  - `PlatformInvoice`/`PlatformInvoiceCreditNote` and `BillingService`;
  - doc 155's trade payable in place of custody;
  - `SeatCounterService`'s single read-only query as the only boundary
    crossing.

  No second authorization system, event system or billing system is added.
- **ADR-037's reopening condition is met on its own terms.** An installed app
  must outlive its installer, or every tenant loses its integrations at the
  next staff change.
- **A directory is only safe if review is honest.** Review verifies what a
  remote service lets NEWAX verify — contract minimality, protocol behaviour
  in a sandbox tenant, signature verification, publisher identity, policy on
  paper. The consent screen says what the badge does not mean.

### Consequences
- **Doc 34's deferred work is now required, not optional**, with four
  corrections: no `organizationId`; a login-disabled actor `User`
  (`User.principalKind`); token-based credentials; and a flushed request log.
  Core changes accompany it: a `JwtAuthGuard` branch; refusals in `AuthService`,
  `JwtStrategy`, `UsersAdminService`, `RolesService` and
  `ApprovalService.start()`; a metadata argument on `EventBusService.dispatch()`;
  and a lease on `OutboxEvent`, which doc 163 §7 already asked for.
- **Review of arbitrary third parties is a permanent operational cost**, not a
  one-time build: staffed queues with SLAs, a sandbox tenant, report
  handling, suspension decisions, fast-tracked key rotations. Phase 4 cannot
  open until that capacity exists.
- **The private-connector escape hatch is preserved deliberately.** No tenant
  is ever blocked on nobody having published an app. The directory and the
  connectors share one delivery engine and nothing else.
- **Doc 36 is realised, and corrected, rather than built separately.** Its
  `ConnectorDelivery` becomes `OutboxDelivery` rows of kind `CONNECTOR`. Its
  in-process 8-attempt ceiling for external targets is replaced by a 72-hour
  window, because the old ceiling lost events after 8.5 minutes of target
  downtime, contradicting its own "four hours down" lens.
- **Recorded as found and not fixed here:**
  - doc 18 §18.3 and doc 166 §2 describe `pushOutbound()` as retried and
    at-least-once, and it is neither (WO-188.10);
  - doc 166's "no frontend of any kind" and "the platform's own storage
    driver" are both inaccurate;
  - `TenantsService.reactivate()` erases suspension history.
- **Open for doc 163's owner, not decided here:** whether personal keys should
  also lose `org.access.grant`, whose grants outlive the key that issued them.
- **Stated risks, not hidden:**
  - the kill switch fails open when the control plane is unreachable
    (< 2 min bound when it is reachable; warned at 30 min and 24 h);
  - enrolling a tenant in the directory is a manual ops step until WO-195.1;
  - revenue share cannot pay out until WO-192.0's legal/accounting
    confirmation and a general "invoice paid" record (WO-192.6) exist;
  - evidence-class audit is transactional, not tamper-evident, until
    `AuditLog` immutability (ruling 1).
- **Supersedes ADR-037's service-account deferral only.** ADR-037's
  personal-key decisions stand, and its status line points here.

### Status
**Accepted** — the architecture and the remote-only rule. Every work order in
docs 184–195 is proposed, not yet built.
