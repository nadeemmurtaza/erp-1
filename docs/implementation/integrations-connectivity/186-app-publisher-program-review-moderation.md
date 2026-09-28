# 186 — Publishers, review and moderation: what NEWAX can honestly verify about a service it does not run

> **Status: proposed, not yet built.** No `AppPublisher`,
> `AppPublisherCredential`, review queue or `platform.apps.*` permission
> exists (grep, `main` at `642b2831`). Built on doc 166's
> `MarketplacePublisherCredential` shape (hash-only, own pepper,
> ops-issued, a guard that derives identity from the key), doc 166's
> `GlobalProductReferenceFlag` report shape (reviewed by staff, never
> auto-applied), `OpsAuthGuard`/`PLATFORM_PERMISSIONS`, and the existing
> static ops console `apps/platform/src/modules/ui/pages/admin.html`. Part of
> [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program (ADR-073).

## 1. A publisher is its own principal, and usually not a tenant

A publisher is whoever builds and operates an app: an outside software
company, a payment company, a freelancer, or NEWAX itself for its own
first-party apps. Most publishers are **not** NEWAX tenants and have no
`PlatformTenant` row. So doc 166's `MarketplacePublisherCredential` — keyed
`tenantId @unique`, "one row per tenant that has opted into the cross-tenant
network" — cannot be reused as a table. Its publisher *is* a tenant. Its
**shape** is reused exactly: an ops-issued, hash-only credential with its
own pepper, and a guard whose load-bearing property is that "which
publisher" comes from the key and never from a parameter.

```prisma
// apps/platform/prisma/schema/app-directory.prisma (with doc 185's models)

enum AppPublisherStatus {
  ACTIVE
  SUSPENDED    // every listing SUSPENDED with it (doc 191 §3); reversible
  TERMINATED   // terminal; every listing REMOVED after the notice window (§5.3)
}

model AppPublisher {
  id               String             @id @default(cuid())
  legalName        String
  displayName      String
  /// The publisher's business contact for review outcomes, reports and
  /// policy notices — a business address the publisher controls, not a
  /// literal in NEWAX code (Law 1; "audience is a capability" for an actor
  /// that holds no permission key — the address is the publisher's own
  /// declared channel, stored as data).
  contactEmail     String
  websiteUrl       String
  /// Domains every manifest URL must sit under (doc 185 §2). Set by an ops
  /// principal after verification, the same manual step doc 39 uses for
  /// PlatformTenant.customDomainVerifiedAt until DNS TXT automation exists.
  verifiedDomains  String[]
  /// The directory policy version (§4) this publisher accepted, and when.
  policyVersion    String
  policyAcceptedAt DateTime
  /// Nullable edge (ruling 11): set when the publisher is also a NEWAX
  /// tenant building an app for others; null means an external developer
  /// with no hosted deployment — the common case. Informational only; it
  /// grants nothing on either side.
  platformTenantId String?            @unique
  status           AppPublisherStatus @default(ACTIVE)
  createdByOpsClientId String
  createdAt        DateTime           @default(now())

  credentials   AppPublisherCredential[]
  listings      AppListing[]
  payables      AppPublisherPayable[]    // doc 192
}

/// Doc 166's MarketplacePublisherCredential shape, for a publisher instead
/// of a tenant. Own pepper (PLATFORM_APP_PUBLISHER_KEY_PEPPER): a different
/// credential type with a different blast radius, the exact reasoning
/// product-reference-key.ts gives for not sharing PLATFORM_AGENCY_KEY_PEPPER.
model AppPublisherCredential {
  id                  String    @id @default(cuid())
  publisherId         String
  label               String    // "CI pipeline", "Release manager"
  apiKeyHash          String    @unique
  lastFour            String
  issuedByOpsClientId String
  expiresAt           DateTime  // mandatory, ≤ 365 days — doc 163's "a key with no end date is a grant nobody remembers to end"
  lastUsedAt          DateTime?
  revokedAt           DateTime?
  revokedReason       String?
  createdAt           DateTime  @default(now())

  publisher AppPublisher @relation(fields: [publisherId], references: [id])

  @@index([publisherId])
}
```

**One deliberate deviation from doc 166.** Doc 166 revokes a credential by
deleting its row (its deviation 2). Here revocation sets `revokedAt`,
because every `AppVersion.submittedByCredentialId` must keep resolving:
"which credential submitted the version that is now suspected" is the first
question in a compromise investigation (doc 194 §5). That is also the
repository's standing preference for a reversible, attributable step over a
delete.

**The guard.** `AppPublisherCredentialGuard`
(`apps/platform/src/modules/app-directory/app-publisher-credential.guard.ts`)
mirrors `MarketplaceCredentialGuard` line for line. It reads
`X-App-Publisher-Key`, hashes it with `hashMarketplaceApiKey`'s shape under
the new pepper, and refuses a missing, unknown, revoked or expired key, or a
publisher not `ACTIVE`. It attaches `request.publisher`. No publisher route
takes a publisher id, and every listing route checks
`listing.publisherId === request.publisher.id`. A throttler mirroring
`marketplace-key-throttler.guard.ts` bounds guessing.

## 2. How a publisher gets in — by phase

| Phase (doc 195) | How a publisher is onboarded | Why this and not more |
|---|---|---|
| 1 — curated | Only NEWAX itself, as a first-party `AppPublisher` row created by ops | Proves the install/consent/revoke loop on apps NEWAX controls end to end, before anyone else's code is at the other end of the socket |
| 2 — invited partners | Ops creates `AppPublisher` and issues an `AppPublisherCredential` (`platform.apps.publishers.manage`), after a signed partner agreement and domain verification | Doc 166 deviation 1's own precedent: an ops-issued credential, no self-service, until the review pipeline has run on real third parties |
| 4 — public | A self-service developer sign-up and sign-in (§2.1) | Only once review capacity, the policy and the complaint loop are proven |

### 2.1 What public self-service needs that does not exist yet — named, not built early

`apps/platform` authenticates only `PlatformOpsClient` today (doc 39's status
note: "this control plane has no tenant-login principal yet"). Doc 170 §3.4
specifies a NEWAX **staff** sign-in. A public developer program needs a
third kind of human sign-in, with requirements stated now so Phase 4 is not
designed under deadline:

- **Sign-in through an external OIDC identity** — doc 161's `OidcProvider`
  design against a developer IdP. Bound by the IdP's stable subject, never
  by email: doc 170 §3.2's `SUBJECT_INVITE` reasoning, because
  email-matching an arbitrary developer is account takeover by
  configuration.
- **A second factor, proven** — the IdP's `amr` claim must show MFA, or
  sign-in is refused. A publisher account that can submit a version to
  50,000 tenants must not fall to one phished password (doc 194 §6).
- **Email verification before any listing exists** — doc 51's
  `SignupVerification` shape (a token hash, consumed once, expiring).
- **The session mints `AppPublisherCredential`s** for CI. The credential
  model above does not change.

## 3. The review pipeline — honest about what it can and cannot verify

NEWAX cannot read an app's source, inspect its servers, or watch what it
does with data once received. A review that pretended otherwise would make
the "Reviewed by NEWAX" badge a lie. So review verifies exactly five things,
each with a real mechanism, and the consent screen says in plain words what
the badge means and what it does not (doc 187 §2).

| Review verifies | Mechanism | It does **not** verify |
|---|---|---|
| **1. The declared contract is legal and minimal** | `validateAppManifest()` (doc 185 §2) refuses anything illegal; a human checks every requested key against its justification and the app's stated function | That the app uses only what it declared — the grant enforces that (doc 189), not the review |
| **2. The endpoints behave per protocol** | The conformance run (§3.2) against a NEWAX-owned sandbox tenant through the **ordinary** install flow | That production behaves like the sandbox run |
| **3. It authenticates us and protects its credential** | The conformance run's signature probes: a correctly signed delivery must get 2xx; a mis-signed, unsigned, or stale-timestamp one must get 4xx | How it stores tokens at rest |
| **4. The publisher is who it says and controls its domains** | `verifiedDomains`, legal name, a signed partner agreement (Phases 2–3) | Its security programme |
| **5. The policy obligations are met on paper** | Privacy policy, terms and support contact present and covering §4's required items; a licensing attestation for `PAYMENT` | Compliance with them after approval — that is §5's ongoing job |

### 3.1 Step 1 — automated, on submit (platform)

`AppReviewService.runAutomatedChecks(versionId)` stores its whole result on
`AppVersion.automatedChecks`:

- `validateAppManifest()` passes;
- every URL is HTTPS, under a `verifiedDomains` entry, and resolves only to
  public addresses. Loopback, RFC 1918, link-local and cloud metadata ranges
  are refused, because NEWAX's own servers will POST to these URLs (the
  send-time SSRF check is doc 188 §4's; this is the early one);
- a TLS handshake succeeds with a certificate valid for at least 14 more
  days;
- every signing key parses, `alg ∈ {ES256, RS256≥2048}`, and `kid` is unique
  within the listing;
- the icon passes doc 185 §6's checks;
- `diffManifests()` against the last approved version sets
  `requiresReconsent`.

A failed check leaves the version `SUBMITTED` with the report visible to the
publisher (`GET /app-directory/v1/publisher/versions/:id`). It never
reaches a human queue, and it is never auto-rejected: the publisher fixes it
and submits a new version, withdrawing this one. All checks pass →
`IN_REVIEW`.

### 3.2 Step 2 — the conformance run in a sandbox tenant

The sandbox is an **ordinary tenant**: a `PlatformTenant` provisioned
through doc 51's existing TRIAL path by NEWAX ops (slug `app-review-sandbox`),
seeded with demo data only, whose admins are NEWAX reviewers. Nothing
about it is special-cased in code. The review therefore exercises exactly
the path a real tenant uses:

1. The reviewer is invited to the listing (`AppListingInvite` for the
   sandbox tenant, which INVITE_ONLY visibility makes necessary anyway). They
   install the version from the sandbox's `/admin/apps/directory` through the
   normal consent screen (doc 187).
2. The app completes its token mint (doc 189 §2) — proven by an
   `ApiClientToken` row appearing.
3. The reviewer presses **Run conformance check** on the installation's
   detail screen. `AppConformanceService.probe(installationId)` (tenant-side,
   `apps.manage`, `@SessionOnly()`) sends five deliveries to the webhook URL,
   each a real `installation.conformance_probe` lifecycle envelope:
   correctly signed (expect 2xx within 10 s); signature from a wrong secret
   (expect 4xx); no signature header (expect 4xx); correctly signed but
   `t=` older than 5 minutes (expect 4xx); and the correctly signed one
   repeated with the same `id` (expect 2xx — idempotent). For a
   `providers[]` app it also runs doc 190's protocol conformance suite
   against the provider endpoints. Results land in an `AppConformanceRun`
   row (below) and on screen.
4. The reviewer exercises the app as its listing describes it, then reads
   the installation's `ApiClientRequestLog` (doc 189 §4) and the 403 log.
   Did it call routes its justification did not describe? Did it hit routes
   it was not granted? A 403 storm during review is a rejection reason on its
   own.
5. The reviewer records the `AppConformanceRun.id` in the decision.

The probe is available to **every** tenant admin, not only reviewers: any
admin can check that an installed app still rejects forged deliveries. It
is deliberate, useful, and costs nothing extra.

```prisma
// apps/api/prisma/schema/app-installations.prisma (tenant side)
model AppConformanceRun {
  id             String   @id @default(cuid())
  installationId String
  runByUserId    String
  /// One entry per probe: { probe, expected, httpStatus, latencyMs, passed }.
  results        Json
  passed         Boolean
  runAt          DateTime @default(now())

  @@index([installationId, runAt])
}
```

### 3.3 Step 3 — the human decision

The ops console gains an **Apps** tab (§6). For an `IN_REVIEW` version it
shows the manifest, the diff against the last approved version, every
automated check, and the checklist:

- Every permission is necessary for the stated function and its
  justification is true. A shipping app asking for `payroll.view` is
  rejected however it is justified.
- Every topic is covered by a requested permission (enforced) and is needed.
- Privacy policy names the data categories received, retention, sub-processors,
  deletion within 30 days of `installation.deleted`, and breach notification
  to NEWAX within 72 hours (§4).
- Listing text is honest. It does not impersonate NEWAX or another real
  company, does not claim to be "official" or endorsed, and makes no claims
  the manifest contradicts (§4 item 8).
- Category-specific: `PAYMENTS` needs a licensing attestation — the
  publisher is, or contracts with, a licensed payment institution in the
  markets it serves. NEWAX is never the money transmitter (doc 175's custody
  boundary; doc 155's "never third-party fund custody"). `COMPLIANCE` must
  state the jurisdictions it claims.
- The conformance run passed.

**Approve** (`POST /app-directory/v1/ops/versions/:id/approve`,
`platform.apps.review`) sets `APPROVED`, `reviewedByOpsClientId`,
`reviewedAt`. If the listing was `DRAFT`, it becomes `LISTED` and
`currentVersionId` points here. One `AppListingStatusChange` row of kind
`VERSION_APPROVED` goes onto the status feed (doc 191 §3), which is how every
tenant learns of the version (doc 185 §5). **Reject** requires a reason,
shown to the publisher.

**The toxic pair, refused at the act.** `AppReviewService.approve()`
refuses when the reviewing ops client issued any live
`AppPublisherCredential` of this listing's publisher
(`issuedByOpsClientId`). Otherwise one ops client holding both
`platform.apps.publishers.manage` and `platform.apps.review` could mint a
publisher key, submit, and approve its own submission. There is no
ops-client issuance endpoint to refuse the pair at grant time — doc 39's
status note records that bootstrap gap — so the refusal belongs at the act,
comparing stored ids, like `CustomQuoteService.approve()` already does for
quotes (doc 50).

**Fast track.** A version whose only changes are a signing key or
translation text (`diffManifests()` says so) skips the conformance run
unless the webhook URL also changed. It goes to the top of the queue with an
SLA of 4 business hours: a compromised key must be replaceable the same
day (doc 194 §5).

### 3.4 Review SLAs and capacity — an ongoing cost, stated

Review is operational work that never ends. It is not a one-time build.
Targets for Phase 2: automated checks under 5 minutes, a first human
decision within 3 business days, fast track within 4 business hours. The
Apps tab shows queue age. A version `IN_REVIEW` for more than 5 business
days appears in the ops digest (`PLATFORM_OPS_ALERT_EMAIL`, the same digest
channel `ResourceQuotaAlertCron` uses). ADR-073's consequences carry this
cost into the decision record.

## 4. The directory policy — the policy layer this program enforces

A versioned page served by `UiController` at `/ui/app-directory-policy`
(the same static-page mechanism as `/ui/pricing`). Its version string is
recorded on `AppPublisher.policyVersion` at onboarding and re-accepted on
each material change. It is NEWAX's own document — Law 1's one exception
for NEWAX's own attribution. What every publisher agrees to, each item
backed by something checkable:

1. **Purpose limitation** — use received data only for the function the
   listing describes; never resell it. *(Checked: justification review;
   enforced: the grant.)*
2. **Deletion** — delete a tenant's data within 30 days of
   `installation.deleted`, and confirm on request. *(Attested; a tenant
   report under category `DATA_MISUSE` starts §5.)*
3. **Authenticate NEWAX** — verify every delivery's signature and timestamp.
   *(Checked: conformance probes, re-runnable by any tenant.)*
4. **Protect credentials** — keep private keys out of client code; rotate a
   key on suspicion within 24 hours; notify NEWAX of a breach within 72
   hours. *(Attested; the fast track makes rotation possible.)*
5. **Honour old grants** — keep serving installations on an older grant for
   at least 90 days after publishing a version that needs re-consent (doc
   185 §5).
6. **Respect limits** — stay within the rate limit (doc 189 §4) and never
   probe routes it was not granted. *(Observed: 403 rate, §5.)*
7. **Licensing** — for payments, maintain the licence attested at review.
8. **Honest listing** — no impersonation, no undisclosed price.
9. **Support** — answer a tenant's support request within 5 business days.

## 5. After approval — complaints, signals, suspension, termination

### 5.1 Tenant reports

The installation screen (doc 187 §7) and the listing page have **Report
this app**. It goes through the tenant proxy to `POST
/app-directory/v1/listings/:slug/reports` (`MarketplaceCredentialGuard`; the
reporting tenant is the key's tenant, never a body field):

```prisma
enum AppReportCategory { SECURITY  DATA_MISUSE  ABUSE  BROKEN  BILLING  POLICY  OTHER }

/// GlobalProductReferenceFlag's shape (marketplace.prisma): a report is
/// reviewed by NEWAX staff and never auto-applied — a report can never, by
/// itself, suspend an app, or any tenant could take a competitor's app down.
model AppListingReport {
  id                  String            @id @default(cuid())
  listingId           String
  reportedByTenantId  String
  category            AppReportCategory
  reason              String            // ≤ 4,000 chars, plain text
  createdAt           DateTime          @default(now())
  resolvedAt          DateTime?
  resolution          String?
  resolvedByOpsClientId String?

  listing AppListing     @relation(fields: [listingId], references: [id])
  tenant  PlatformTenant @relation(fields: [reportedByTenantId], references: [id])

  @@index([listingId, resolvedAt])
  @@index([resolvedAt, category])
}
```

Reports of category `SECURITY` or `DATA_MISUSE` appear at the top of the
Apps tab and in the ops digest the day they arrive. Every report is
answered to the publisher's `contactEmail` (with the reporting tenant's
identity withheld) and to the reporting tenant's `billingContactEmail` when
resolved.

### 5.2 Signals the platform can actually see

The platform has no view into a tenant's request logs, and doc 39's
boundary says it should not have one by default. What it has:
`AppInstallationRecord` counts and status (doc 187 §3), uninstall reasons
reported with the lifecycle notice (doc 191 §2), and reports. What each
tenant has locally, surfaced to its own admin (doc 189 §4): an
installation's 403 rate and rate-limit hits. A cross-tenant anomaly view —
"this app is being refused on 200 tenants at once" — would need tenants to
report per-installation counts upward. It is named as later work (doc 195
Phase 4), because it widens what crosses the boundary and deserves its own
decision.

### 5.3 Suspension, reinstatement, removal, termination

The mechanics live in doc 191 §3, where the kill switch is specified. The
policy lives here:

- **Suspend a listing** (`platform.apps.suspend`, one ops principal,
  immediate): confirmed malicious behaviour, a credible `SECURITY` report,
  a licence lapse for a payment app, or a publisher key compromise. The
  safety direction needs no second signature, because speed is the point.
- **Reinstate** (`platform.apps.reinstate`, a **different** ops principal
  from the one who suspended — refused at the act by comparing ids): only
  after the cause is fixed. For a key compromise, only after a
  fast-tracked version with rotated keys is approved.
- **Remove** a listing (terminal): after a suspension that will not be
  fixed. Every installation is uninstalled by the tenant-side poller (doc
  191 §3) and tenants are told why.
- **Suspend a publisher**: every listing of theirs is suspended. **Terminate
  a publisher**: a 30-day notice window in which listings are `UNLISTED`
  (existing installations keep working and tenants are told to migrate),
  then `REMOVED`. For malicious conduct, removal is immediate, with no
  window.

## 6. Where NEWAX staff do this

`apps/platform/src/modules/ui/pages/admin.html` gains an **Apps** tab. It is
the same static-page pattern and the same pasted ops key as the other eight
tabs, since `apps/platform` has no staff sign-in until doc 170 §3.4 is
built. Sections: *Review queue* (by age, with fast-track first), *Reports*
(unresolved, security first), *Listings* (status, suspend/reinstate/remove),
*Publishers* (create, issue/revoke credentials, verify domains,
suspend/terminate). Every button calls an ops route under
`/app-directory/v1/ops/…` guarded by `OpsAuthGuard` +
`@RequireOpsPermission(...)`.

**Ops permissions** — added to `PLATFORM_PERMISSIONS`
(`apps/platform/src/core/security/ops-permissions.ts`), each with its reason
beside it, as that file already does:

| Key | Gates | Why separate |
|---|---|---|
| `platform.apps.publishers.manage` | Create/suspend/terminate publishers; issue/revoke their credentials; set `verifiedDomains`; invite tenants to INVITE_ONLY listings | Onboarding a party is not judging its code (§3.3's toxic pair) |
| `platform.apps.review` | Approve/reject versions; resolve reports | The judgement itself |
| `platform.apps.suspend` | Suspend a listing or publisher | The emergency lever — one person, immediately |
| `platform.apps.reinstate` | Reinstate or remove | The risky direction — refused to whoever suspended |

`PlatformOpsClient` has scopes on the row and no role/seed system (doc 39
status), so "seeded" means the WO sets these scopes on the named ops
clients NEWAX creates for its reviewers. Doc 39's ops-client bootstrap gap
applies unchanged.

## Scope lenses

Lenses about tenant data access are answered in full in docs 187 and 191.
Lines below cover what this document uniquely introduces: the publisher, the
reviewer and the report.

**The five shop-scale lenses.** *Start to finish* — sign-up/onboard →
credential → listing → version → checks → conformance → decision →
listed → reports → suspend/reinstate. *The other side* — the ops Apps tab is
the operator twin of the publisher API. *After "done"* — reports,
suspension, termination with a notice window (§5.3). *Real integrations* — a
real conformance run through the real install path. *Policy* — the
versioned directory policy (§4).
**The actor with three tables** — publisher: `AppPublisher` (+
`AppPublisherCredential`), a platform principal; optionally linked to a
`PlatformTenant` by `platformTenantId`, which grants nothing. Reviewer:
`PlatformOpsClient`. Reporter: a `PlatformTenant`, identified by its
directory credential.
**The principal with no permission key** — a publisher credential is checked
against **ownership** only: `AppPublisherCredentialGuard` attaches the
publisher; every route compares `listing.publisherId`. It holds no
`PERMISSION_CATALOG` or `PLATFORM_PERMISSIONS` key, and can never read an
installation, a tenant, or another publisher's anything.
**The grant that ends itself** — `AppPublisherCredential.expiresAt`
(mandatory, ≤ 365 days); `AppPublisher.status` SUSPENDED/TERMINATED stops
every credential on the next request (the guard checks it); the Phase 4
developer session will expire on the IdP's terms.
**Whose rows, and which columns** — a publisher sees its own listings,
versions, check reports, bucketed install counts, and reports about its
apps with the reporting tenant withheld. It never sees which tenants
installed it — only NEWAX ops and each tenant itself know that.
**The threshold nobody approves alone** — reinstatement: two distinct ops
principals (suspender ≠ reinstater). Version approval: one reviewer plus the
automated checks, because the consent screen is the second gate — no
tenant is affected until its own admin consents.
**The toxic pair, caught at grant or at act** — `platform.apps.publishers.manage`
+ `platform.apps.review` on one ops client, refused at the act in
`AppReviewService.approve()` by comparing `issuedByOpsClientId`; and
suspender ≠ reinstater in `AppModerationService.reinstate()`.
**Authority and blast radius** — the widest setting here is approving a
version, which affects every tenant that *later consents*. Suspending
affects every installation within doc 191's feed bound. Each ops act writes
an `AppListingStatusChange` or a review field carrying actor, from, to and
reason — old and new values, never "fields changed".
**Audience is a capability, not an address** — ops-side notices go to the
`PLATFORM_OPS_ALERT_EMAIL` digest (doc 39's existing channel, one digest per
run, never a ping per report). Publisher notices go to
`AppPublisher.contactEmail`, the publisher's own declared channel, stored as
data. Tenant notices go to `PlatformTenant.billingContactEmail`, and that
column's own "log and skip rather than guess" rule applies when it is null.
**Request or record** — a submission is a REQUEST (checks, review). A report
is a RECORD: never refused, even about an app the reporter has since
uninstalled.
**The movement with no address / The unwritten posting rule / Every column
or none / The period that already moved / The second legal entity** — n/a:
review and moderation move no stock or money. Paid-app money is doc 192.
**Four hours down** — the platform down: no new submissions or reviews, and
tenants keep running every installed app (doc 191 §3's fail-open feed
rule).
**Dry run before live** — `validateAppManifest()` and `diffManifests()` are
pure; the conformance run is the live dry run, against a sandbox tenant
that holds no one's real data.
**Click the number** — "1,000+ installs" is a bucket, deliberately not a
drillable number to a publisher. Ops's own exact count drills into
`AppInstallationRecord` rows.
**Three silhouettes** — a publisher's view is the same whatever edition its
installers run. A Solo shop's admin reports an app exactly as an
Organization's does.
**The absent collaborator** — no reviewers staffed ⇒ versions wait
`IN_REVIEW` and appear in the digest after 5 days. Nothing is auto-approved
on a timeout, ever.
**The second copy of the write** — `@@unique([listingId, version])`; a
double-clicked approve is predicate-on-write (`reviewStatus = IN_REVIEW`),
so the second is a no-op.
**The hundred-thousandth row** — reports and versions are thousands; the
review queue reads `@@index([reviewStatus, submittedAt])`.
**The adoption test** — n/a: every id here is a platform-generated cuid,
from a single writer.
**The reversal document, not the reversal flag** — a wrong rejection is
answered by the publisher's next version. A wrong suspension is answered by
a reinstatement, a new `AppListingStatusChange` row; the suspension row
stays.
**The undo fan-out** — approval: the feed entry (automatic), tenant
auto-upgrades (automatic, doc 185 §5), consent prompts (human, each tenant).
Suspension: doc 191 §3's fan-out.
**The version stamp** — `AppVersion` is immutable; `AppPublisher.policyVersion`
records which policy a publisher accepted.
**The erasure the ledger cannot obey** — `AppPublisher.contactEmail` and
`legalName` are a business's contact, retained under the contract basis
while the publisher is active and for the tax-record period after (doc 192's
payables). `AppListingReport.reason` may name a person; it is free text,
destroyed on request per ruling 1, and the report row itself stays.
**The failure path, and who is allowed to walk it** — a failed automated
check is shown to the publisher on the version. A stuck review is in the
ops digest after 5 days. A failed publisher-notice email is logged and the
notice stays visible in the publisher API. All of it is under
`platform.apps.review`.

## Work orders

**WO-186.1 — schema**: `AppPublisherStatus`, `AppPublisher`,
`AppPublisherCredential`, `AppReportCategory`, `AppListingReport`
(`app-directory.prisma`); `AppConformanceRun` (`app-installations.prisma`,
tenant); forward-only migrations in each app.
**WO-186.2 — publisher credential**: `app-publisher-key.ts` (mirroring
`product-reference-key.ts`), `PLATFORM_APP_PUBLISHER_KEY_PEPPER` in
`env.validation.ts` + `.env.example` + `test/setup-env.ts`,
`AppPublisherCredentialGuard` + throttler, ops issue/revoke routes.
**WO-186.3 — publisher API**: create listing, upsert translations, upload
icon, submit version (runs step 1), withdraw, read own versions/check
reports/bucketed counts/reports.
**WO-186.4 — `AppReviewService`**: `runAutomatedChecks()` (URL/DNS/TLS/key
checks, pure where possible), `approve()`/`reject()` with the toxic-pair
refusal, the fast-track classification.
**WO-186.5 — `AppConformanceService.probe()`** (tenant): the five signature
probes and doc 190's provider suite, recording `AppConformanceRun`; a
**Run conformance check** action on the installation screen.
**WO-186.6 — moderation**: `AppModerationService.suspend()/reinstate()/
remove()` for listings and publishers, writing `AppListingStatusChange`
(doc 191 §3); the report intake route and the tenant proxy route.
**WO-186.7 — ops console**: the Apps tab in `pages/admin.html`; the four
`platform.apps.*` keys in `ops-permissions.ts`; the review-age and
security-report lines in the ops digest.
**WO-186.8 — policy page**: `/ui/app-directory-policy`, versioned.
**WO-186.9 — the developer contract page**: `/ui/developers`, a static page
documenting the manifest (doc 185 §2), topics and envelope (doc 185 §3), the
signature scheme (doc 188 §3), the token protocol (doc 189 §2) and the
provider protocols (doc 190). Each section is generated from the
`@newax/shared` constants at build time where they exist, so the published
contract cannot drift from the code.

## Acceptance

- A publisher credential can read and write only its own publisher's
  listings; presenting it against another publisher's slug returns 404.
- A revoked or expired publisher credential, or one whose publisher is
  SUSPENDED, is refused on the next request.
- An ops client that issued a publisher's live credential is refused when
  approving that publisher's version; a suspender is refused when
  reinstating the same listing.
- A version failing any automated check never enters `IN_REVIEW`.
- `AppConformanceService.probe()` fails an app whose webhook returns 2xx to
  an unsigned delivery.
- A tenant report never changes a listing's status by itself.

## Out of scope

Automated static or dynamic analysis of an app's own code — NEWAX never has
it (doc 184 §2), so a review that claimed to would be false. Paid security
certification of publishers (SOC 2 evidence collection) — a commercial
programme decision, not built. Tenant ratings and reviews of apps. The
Phase 4 developer sign-in itself (§2.1 states its requirements; it is built
when Phase 4 is scheduled). Cross-tenant anomaly telemetry (§5.2).
