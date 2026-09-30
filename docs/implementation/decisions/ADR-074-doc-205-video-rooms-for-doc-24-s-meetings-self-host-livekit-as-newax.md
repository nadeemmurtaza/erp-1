# ADR-074 — Doc 205 (video rooms for doc 24's meetings): self-host LiveKit as NEWAX's own SFU behind a new `VideoConferenceProvider` core seam, run as its own Coolify resource and off by default in every deployment; LiveKit's built-in TURN rather than coturn; recording deferred

[← Decision log](../DECISIONS.md)


### Context

The owner asked for NEWAX to host video for its own meetings rather than
depend on Zoom, Google Meet or Microsoft Teams, and scoped the work small
deliberately:

- **In scope:** real video rooms wired into doc 24's existing `Meeting`
  (ADR-060).
- **Explicitly declined:** a standalone product, a Zoom-competitor business
  line, multi-region, native apps, webinars, breakout rooms and virtual
  backgrounds.

The question this entry settles is **which media engine, and where it lives**.
`docs/implementation/tasks-notifications-support/205-self-hosted-video-meetings-livekit.md`
is the design.

The evidence, checked against the code while writing doc 205:

- **No video anywhere.** `Meeting.location` is a bare `String?`, and no room,
  provider, URL or join mechanism exists in the schema, services or web app.
- **Doc 24 has no invitee-facing surface.** Nothing in `apps/web` calls
  `POST admin/notify/meetings/:id/respond`, no `GET` for meetings exists, and
  the only nav entry is gated on `notify.send`.
- **Doc 24's meetings are not NEWAX-only.** `notify` is in every client
  deployment's `MODULES` (`.env.production.example`).
- **Production runs on Coolify.** `DEPLOYMENT.md`'s own banner says so, and
  the one self-hosted third-party engine already running, Stalwart mail, is a
  Coolify Docker Compose resource (`docker-compose.mail.yml`,
  `docs/email.md`). Doc 13 is that choice's business intent, not its
  mechanism.
- **The typed-provider pattern is proven in code** by `PaymentProvider`,
  `CourierProvider`, `IdentityVerificationProvider`, `AiProvider` and
  `StorageDriver`. `FiscalComplianceProvider` (doc 15) is specified but
  unbuilt: WO-15.5 is blocked.
- **LiveKit's own source shows two facts that shape the access design:**
  - a connected participant's token is re-signed every five minutes, with at
    least ten minutes' validity (`pkg/service/roommanager.go`), so a short
    join-token TTL never ends a live session;
  - rooms auto-create on join by default (`room.auto_create`).

### Options Considered

1. **Integrate exclusively with a third-party API: Zoom, Meet or Teams.**
   Rejected.
   - The owner wants to own the infrastructure and avoid per-seat third-party
     licensing.
   - It would also move admission out of this codebase. A vendor meeting link
     is a bearer URL, and the vendor, not `MeetingInvitation`, decides who is
     let in.
   - It would send every internal conversation and its participant list
     through a vendor.
   - The honest trade: it is the option with the least operational work.
2. **Hand-build a WebRTC media engine.** Rejected. An SFU with congestion
   control, simulcast, adaptive layer selection, TURN, ICE-TCP fallback,
   reconnection and browser interoperability is a multi-year effort. It
   offers no differentiated benefit over an actively maintained open-source
   engine. `CLAUDE.md`'s "can the existing system already solve this?"
   applies to existing open-source systems as much as to this repository's
   own.
3. **Self-host LiveKit (Apache-2.0, Go) as NEWAX's own SFU, behind a new
   `VideoConferenceProvider` extension point.** Chosen.

Choices within option 3, each also weighed:

- **TURN.** LiveKit's embedded TURN (chosen) or a separate coturn.
- **Seam placement.** `apps/api/src/core/video/` (chosen) or inside `notify`.
- **Topology.** One LiveKit per enabling deployment (chosen) or one LiveKit
  shared across deployments.
- **Recording.** Now or deferred (deferred).

### Decision

Option 3.

1. **The seam.** `VideoConferenceProvider` has
   `createRoom`/`generateJoinToken`/`endRoom`/`listParticipants`/
   `removeParticipant`/`handleWebhook`/`ping`, with one implementation,
   `LiveKitVideoConferenceProvider`. It is selected by a
   `VIDEO_CONFERENCE_PROVIDERS` env allowlist that **defaults to empty**, so
   every deployment is byte-for-byte doc 24 until an operator enables it.
2. **Mechanism in core, policy in `notify`.** `core/video` knows rooms,
   grants and webhooks, and nothing of `Meeting`. `notify`'s
   `MeetingVideoService` decides who may join, when, and how many. The result
   is zero new `KNOWN_MODULE_COUPLINGS`, zero new domain events and zero new
   permission keys.
3. **Access.**
   - A join credential is minted only for a `MeetingInvitation` row, and the
     row's id is the LiveKit identity.
   - The route is `@AuthenticatedOnly()` + `@SessionOnly()` (pinned in
     `session-only-routes.spec.ts`) + throttled.
   - Issuance is audited evidence-class (ruling 9).
   - No token ever carries admin, recording, room-creation or hidden grants.
   - Sessions end server-side: `room.auto_create: false`, `endRoom()` at window
     close, on cancel and by the host, plus an admission re-check on every
     `participant_joined` and a per-minute removal sweep for deactivated users.
4. **Deployment.**
   - LiveKit runs as its **own Coolify Docker Compose resource**, like
     Stalwart, never as in-process code in `apps/api`. No media packet
     touches the API.
   - One instance per enabling deployment, with no Redis.
   - TURN/TLS on 443 through a Traefik TCP router with PROXY protocol.
   - It starts co-located, capped by container limits and a **measured**
     `limit.bytes_per_sec`.
5. **Recording is deferred** to its own later phase and ADR.
6. **Scope boundary.** Doc 205 owes doc 24 its missing invitee surface
   ("My meetings"), because a Join button needs somewhere to live.
7. **Not a product.** It is enforced by configuration and by what is not
   built: no plan, module toggle, listing, pricing or metering.

### Reasoning

- **It is doc 13's decision, taken again for a second kind of
  infrastructure.** Doc 13 chose a specific open-source engine (Stalwart) over
  a paid service. `docs/email.md` then deployed it as a Coolify resource beside
  the existing Postgres and Redis, rather than inside the app. LiveKit follows
  the same shape, and needs even less: no database and no Redis at one node.
  Real-time media is different in kind from a CRUD process, exactly as
  `RETAIL-ERP.md` gives a node its own database. So it gets its own deployable
  unit, and the modular monolith is not reopened.
- **House Rule 8, applied as the codebase already applies it.**
  `IdentityVerificationProvider`'s own header states the rule this follows: a
  single implementation still gets the interface, because it is the kind of
  external integration that gets a second one. `AiService`'s allowlist, its
  timeouts and `isAvailable()`-before-render are copied, not reinvented.
- **The seam goes in core because it knows nothing about meetings.** It
  mirrors `core/notifications` (delivery) beside `notify`'s `AudienceService`
  (who).
  - Placing it in `notify` would cost nothing today. But a later consumer
    outside `notify` (a sector pack that needs a room) would then have to
    import `notify`, which the boundary checker refuses, or wait for a move.
  - Placing it in core keeps that door open at zero cost now.
  - This document builds no second consumer. That would be speculative.
- **Built-in TURN** issues per-participant credentials that expire in 300
  seconds by default. It relays only to the SFU, and it enforces a
  per-participant relay-allocation quota.
  - A coturn deployment would need a long-lived shared secret, a second
    credential path, and deliberate peer-range denial so it is not an open
    relay into the Coolify network.
  - Coturn's advantages, independent scaling and a separate IP, belong to a
    scale this feature explicitly does not target.
- **One LiveKit per deployment, because the webhook stream is data.**
  LiveKit's `webhook.urls` is server-global. A shared instance would send each
  tenant's participant names and room activity to every other tenant. That is
  doc 39's "shares infrastructure, never a database" rule, applied to the
  thing that here plays the database's role.
- **Recording is deferred for concrete reasons,** each detailed in doc 205
  §10:
  - Egress is a second, CPU-heavy service that needs Redis;
  - `StorageDriver.put()` takes a whole `Buffer`, and production's
    `STORAGE_DRIVER=local` volume is unreachable from another container;
  - consent and notice policy is unwritten;
  - no table in the repository has a retention column (ruling 1's
    prerequisite is open);
  - playback needs a new permission and read-audit.

  Building it halfway would leave one of those five answered by accident.

### Consequences

- **Ongoing operational spend, not a one-time cost.**
  - Media bandwidth and CPU grow roughly with *N* × (*N* − 1) per room.
  - Every TURN-relayed participant crosses the host's interface twice.
  - This is recurring spend on the Coolify host's bandwidth, and it may force a
    dedicated server. Doc 205 requires the capacity figure be measured on the
    real host (`lk load-test`) before any deployment enables video, not
    estimated.
- **New infrastructure the team must operate, not just new code.**
  - A network-facing service with newly opened public UDP and TCP ports.
  - Its image updates and security releases.
  - Zero-downtime API-key rotation.
  - A Traefik TCP router for TURN/TLS.
  - Firewall rules, log rotation, and re-measuring capacity.

  `docs/video.md` (WO-205.7) is the runbook, and whoever operates the Coolify
  project owns it.
- **Monitoring is only structured logs plus a container healthcheck.** No
  metrics backend exists in this codebase. LiveKit's Prometheus endpoint stays
  off until one is adopted here as its own decision.
- **Every deployment carries the code, dormant.** Nothing changes until an
  operator sets the allowlist and runs a LiveKit resource. Doing that for a
  client deployment is an operator decision with its own cost line, not taken
  here.
- **A stated residual on deactivation.** A deactivated user already in a room
  may hear it for up to 60 seconds, until the next sweep. Closing that gap
  needs a `UserDeactivated` domain event from `users`, a separate decision
  named in doc 205's Out of scope.
- **Hosts can now see who actually attended their meeting.** That is a new
  visibility, limited to the meeting's caller by the same check
  `MeetingsService.cancel()` makes.
- **Doc 24 gains its first invitee-facing surface.** Its `respond()` route
  becomes reachable from a screen for the first time.
- **Three pre-existing doc-24 gaps are flagged, not fixed:**
  - `GET :id/shortfall` has no caller or reach check;
  - its two quorum settings have no editing route;
  - its erasure lens cites doc 25, which is payroll.
- **Three new dependencies,** each with a dependency-standard block in doc
  205: `livekit-server-sdk` (API), and `livekit-client` and
  `@livekit/components-react` (web, room route only, hooks and primitives
  only, never `@livekit/components-styles`).

### Status
**Accepted** — the engine, the seam and the deployment decision. Doc 205's
work orders (WO-205.1–205.7) are proposed, not yet built.
