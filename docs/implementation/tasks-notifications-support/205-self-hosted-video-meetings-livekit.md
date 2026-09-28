# 205 — Video rooms for internal meetings: self-hosted LiveKit behind a `VideoConferenceProvider` seam

> **Status: proposed, not yet built (2026-09-28). DECISIONS.md ADR-074.**
>
> **What is already real, and is extended here rather than rebuilt:** doc 24's
> meetings (ADR-060). `Meeting`/`MeetingInvitation`/`InviteResponse` in
> `apps/api/prisma/schema/notify.prisma`. `MeetingsService.create()` / `respond()` /
> `shortfallReport()` / `cancel()`. `MeetingsController` at
> `admin/notify/meetings`. The `notify.send` permission, seeded to `STAFF` and
> `ADMIN`. The caller's form at `/admin/notify/meetings`. Delivery through
> `NotificationsService`. **Verified against the code:** `Meeting.location` is a
> bare `String?`. No video room, provider, URL or join mechanism exists anywhere
> in the schema, services or web app.
>
> **What is genuinely new:**
> - A core seam: `apps/api/src/core/video/`, holding `VideoConferenceProvider`,
>   `VideoConferenceService`, and its one implementation,
>   `LiveKitVideoConferenceProvider`.
> - Four nullable columns on `Meeting`, one new model
>   (`MeetingVideoAttendance`) and three `SettingKey`s.
> - Routes on `MeetingsController`: attach and its preview, join, end,
>   attendance, video status, and "my meetings". Also the provider webhook
>   (`webhooks/video/:providerKey`) and one settings pair
>   (`admin/settings/meeting-video`). A reconciler cron.
> - Two web screens (my meetings, the room) and a section on `/admin/settings`.
> - One new deployed service: LiveKit, as its own Coolify resource.
>
> **Four premises corrected against the code while writing this.** Each one
> changes the plan, so each is stated rather than carried forward:
>
> 1. **Doc 24 is not NEWAX-only.** `notify` is in every client deployment's
>    `MODULES` (`.env.production.example` line 53). Every deployment's staff
>    use `Meeting`, not just NEWAX's own instance. §2 says what "not a product"
>    therefore has to mean.
> 2. **Doc 24 ships no invitee-facing surface.** Nothing in `apps/web` calls
>    `POST :id/respond`. There is no `GET` for meetings at all. The only nav
>    entry is gated on `notify.send`. A Join button needs a place to live, so
>    this document owes one ("My meetings", §11).
> 3. **Doc 13 is not the deployment precedent. `docs/email.md` is.** Doc 13
>    describes the business intent: a self-hosted Stalwart mail server instead
>    of a paid service. The mechanism that actually runs is a Coolify Docker
>    Compose resource (`docker-compose.mail.yml`), and `docs/email.md` is its
>    runbook. `DEPLOYMENT.md` opens by saying its own Swarm/Caddy content "is
>    no longer in use". This document follows the mail resource.
> 4. **`FiscalComplianceProvider` is specified, not built.** Doc 15's WO-15.5
>    is blocked. The typed-provider pattern is proven in code by `PaymentProvider`,
>    `CourierProvider`, `IdentityVerificationProvider`, `AiProvider` and
>    `StorageDriver`. House Rule 8 names all but the identity one. Those five are
>    the precedents cited here.

The owner asked for NEWAX to host video for its own meetings rather than rent it
from Zoom, Google Meet or Microsoft Teams. The owner scoped this small
deliberately:

- **In scope:** real video rooms wired into doc 24's existing `Meeting`, so a
  meeting that was a time, a place and a required response also gets a room
  people can join.
- **Explicitly declined:** a standalone product, a Zoom-competitor business
  line, multi-region, native mobile apps, webinars, breakout rooms and virtual
  backgrounds.

The engine is decided (ADR-074): **self-hosted [LiveKit](https://github.com/livekit/livekit)**.
It is an Apache-2.0, Go-based WebRTC SFU. NEWAX runs it as its own media server,
behind one interface, with one implementation.

---

## 1. What exists today, verified

| Artifact | What it is today | What this document does to it |
|---|---|---|
| `Meeting` (`notify.prisma`) | `id title detail startsAt endsAt timezone location? audienceId calledByUserId orgUnitId createdAt cancelledAt?`; `@@index([orgUnitId, startsAt])`. No `organizationId`: the deployment is the tenant (ADR-040/044/060). | Gains four nullable video columns (§6). A `NULL` `videoProviderKey` means exactly today's meeting. |
| `MeetingInvitation` | `meetingId userId required response respondedAt?`, `@@unique([meetingId, userId])`. Keyed by **`userId`**, not the `employeeId` doc 24's own sketch named. Materialised once at `create()`. | Becomes the **only** thing a join credential is minted for. Gains a relation to attendance. |
| `MeetingsService` | `create()` resolves the audience and materialises invitations. `respond()` refuses a non-invitee (`ForbiddenException`) and a cancelled meeting. `cancel()` is caller-only and notifies every invitee. `shortfallReport()` counts required invitees who have not answered. | `cancel()` gains one best-effort `endVideo()` call. Nothing else changes. |
| `MeetingsController` | `POST /` and `POST :id/cancel` under `@RequirePermission('notify.send')`. `POST :id/respond` is `@AuthenticatedOnly()`. `GET :id/shortfall` is `notify.send`. | Gains routes (§5, §7). The existing four are unchanged. |
| `/admin/notify/meetings` | Caller's form: create, cancel the one just created, and a shortfall lookup by typed-in id. Nav entry `notify-meetings`, gated `notify.send`. | Gains a "Video room" checkbox. It is not rendered when no provider is configured. |
| `apps/api/test/session-only-routes.spec.ts` | Pins `@SessionOnly()` on every route that mints a credential (`SESSION_ONLY_ROUTES`). | Gains the join route. |
| `AuditService` | `record()` is best-effort. `recordEvidence(tx, …)` is transactional (ruling 9). | Join issuance is evidence-class. |
| `UsersAdminService.update()` | Deactivation revokes `RefreshToken`s and personal API keys in one transaction. It publishes **no** domain event. | Not edited. §5.5 explains how a live session ends without an event. |
| `apps/api/src/main.ts` | `rawBody: true`. Only Nest's default JSON and urlencoded parsers. | Gains one raw parser for `application/webhook+json` (§7.5). |

**Three pre-existing gaps found on the way.** None is fixed here: each is outside
this scope, and a silent fix is still a behaviour change.

- **`GET :id/shortfall` has no caller or reach check.** Any `notify.send` holder
  who has a meeting id can read that meeting's non-responder user ids. The
  attendance route added here does **not** copy that shape (§5.6).
- **Doc 24's quorum settings are unreachable.** `NotifyAnnounceQuorumRankLevel`
  and `NotifyAnnounceQuorumRecipientCount` are described as "client-editable, no
  deploy needed". No route or screen edits either one. `settings-admin.controller.ts`
  exposes only `media`, `documents` and `ai`.
- **Doc 24 cites the wrong document for retention.** Its erasure lens cites
  "doc 25's retention basis", but doc 25 is payroll
  (`payroll/25-advance-salary-and-payroll-posting.md`). The retention answer
  here (§Scope lenses) cites ruling 1 instead.

---

## 2. Who this is for, and what "not a product" means when `notify` ships everywhere

The owner's instruction is that this serves NEWAX's own internal meetings. It
is not a sellable module, and it is not a feature to market to tenants.

The code cannot enforce that by where it lives. `notify` is a core-classified
module in every client deployment, so whatever `Meeting` gains, every deployment
gains. The instruction is therefore enforced **by configuration and by what is
deliberately not built:**

- **Off by default, everywhere.** `VIDEO_CONFERENCE_PROVIDERS` defaults to empty,
  the same idiom as `AI_PROVIDERS`. With it empty:
  - no video element renders;
  - the attach route refuses with its remedy;
  - the reconciler does nothing;
  - every existing meeting behaves byte-for-byte as it does today.
- **One LiveKit per deployment that enables it, run by NEWAX.** LiveKit is a
  Coolify resource beside the deployment's Postgres and Redis. There is no
  shared, multi-tenant media service. §8.1 explains why a shared one would also
  leak data between tenants.
- **Nothing commercial is built.** No `PlatformPlan` entitlement, no
  `MODULES` entry, no marketplace listing, no pricing, no metering.
- **NEWAX's own instance is the first and only planned enabler.** Doc 39 and
  doc 182 refer to NEWAX's own instance, but this repository describes only
  `yaseen.pk` concretely. The steps in §8 therefore use `<domain>` placeholders
  and are otherwise identical to `docs/email.md`'s.

Turning video on for a client deployment later is an operator decision with its
own running cost (§8.9). This document neither takes that decision nor makes it
harder to take.

---

## 3. Architecture: three pieces, one boundary

```
                           HTTPS (session cookie / bearer JWT)
  Browser (/admin, signed in) ─────────────────────────────▶ apps/api (NestJS, unchanged process)
     │  ▲                                                     notify:    MeetingVideoService  ── policy: who, when, how many
     │  │ { serverUrl, token, expiresAt }                     core/video: VideoConferenceService ── mechanism: rooms, grants
     │  └───────────────────────────────────────────────────              └─ LiveKitVideoConferenceProvider
     │                                                                        │ HTTPS Twirp RoomService
     │  WSS signalling + WebRTC media (UDP mux / ICE-TCP / TURN)              │ (JWT signed with API secret)
     └─────────────────────────────────────────────────────▶ LiveKit SFU ◀────┘
                                                             (own Coolify resource)
                                                                 │ POST application/webhook+json
                                                                 │ Authorization: JWT{ sha256(body) }
                                                                 ▼
                                                  apps/api  POST /api/v1/webhooks/video/livekit
```

Four rules follow from the diagram.

1. **No media packet ever touches `apps/api`.**
   - A WebRTC SFU is real-time media infrastructure. It is a different kind of
     thing from a CRUD API process, for the same reason `RETAIL-ERP.md` gives a
     node its own database and `docs/email.md` gives mail its own resource.
   - LiveKit therefore runs as its own deployed service. The API talks to it
     only through LiveKit's server API and receives its webhooks.
   - The modular monolith is not reopened: the NestJS side gains files inside
     `core/` and `notify/`, not a process.
   - Doc 139's WebSocket gateway stays unbuilt, and is not needed. Signalling
     goes browser-to-LiveKit.
2. **Only the API holds the LiveKit API secret.** The browser receives a
   short-lived, per-invitation JWT. It never receives a key.
   - House Rule 12 says the frontend "never talks to a database or a third
     party directly". That does not bite here, for two reasons. LiveKit is
     NEWAX's own service, not a third party. And the token is a server-minted
     capability, the same shape as `StorageDriver.signedUrlFor()`.
   - The server URL is public by definition (`wss://rtc.<domain>`). It arrives
     in the API response, not as a `NEXT_PUBLIC_*` build variable, so pointing
     the web app at a different LiveKit needs no rebuild.
3. **Mechanism in `core/`, policy in `notify`.**
   - `core/video` knows rooms, identities, grants and webhooks. It knows nothing
     about `Meeting`.
   - `notify` decides who may join, when, and how many. It is the only module
     that imports the core service.
   - This is the split the repository already has between `core/notifications`
     (delivery) and `notify`'s `AudienceService` (who).
   - Core is platform code, outside the module-independence check
     (`MULTI-SECTOR.md` "Independence"). So this adds **zero**
     `KNOWN_MODULE_COUPLINGS` entries and no new domain event.
4. **The API never needs LiveKit in order to be healthy.**
   - Video is never part of readiness. A slow or dead SFU is a degraded
     feature, not an unready API.
   - Reachability is reported on the settings screen (§11.4), the same way
     `getAi()` reports AI provider status.

---

## 4. The `VideoConferenceProvider` interface

`apps/api/src/core/video/video-conference-provider.ts`. The shape follows House
Rule 8, `StorageDriver` and `IdentityVerificationProvider`: a small interface,
one file per implementation, selected by an env allowlist.

```ts
/**
 * Extension point: video conference providers (205-self-hosted-video-meetings-livekit.md).
 * LiveKit is the only implementation. The interface exists because this is
 * the kind of external integration that gets a second implementation (a
 * managed SFU, a test double) without anyone touching MeetingVideoService.
 * Knows rooms, identities and grants; knows nothing about Meeting.
 */
export interface VideoRoomSpec {
  /** Caller-chosen and stable (`mtg-…`, §6). A provider never invents a room name. */
  name: string;
  /** Hard ceiling on concurrent participants; the provider refuses the next one. */
  maxParticipants: number;
  /** Seconds the room survives with nobody ever having connected. */
  emptyTimeoutSeconds: number;
  /** Seconds the room survives after the last participant leaves. */
  departureTimeoutSeconds: number;
}

export interface VideoJoinGrant {
  roomName: string;
  /** The caller's own id for this seat — MeetingInvitation.id. One identity, one live connection. */
  identity: string;
  /** Shown to others. Set by the server from the User row; the participant can never change it. */
  displayName: string;
  /** Upper bound on the credential's own life. The provider must not issue longer. */
  ttlSeconds: number;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  /** Non-sensitive labels visible to every participant, e.g. { role: 'host' }. */
  attributes: Record<string, string>;
}

export interface VideoJoinCredential {
  /** Where the browser connects — public by definition. */
  serverUrl: string;
  /** Opaque, scoped to one room and one identity. Never logged, never stored. */
  token: string;
  expiresAt: Date;
}

export interface VideoParticipant {
  identity: string;
  /** The provider's id for one connection (LiveKit's participant SID). */
  providerParticipantId: string;
  joinedAt: Date;
}

export type VideoRoomEventKind =
  | 'ROOM_STARTED'
  | 'ROOM_FINISHED'
  | 'PARTICIPANT_JOINED'
  | 'PARTICIPANT_LEFT'
  | 'PARTICIPANT_CONNECTION_ABORTED'
  | 'IGNORED';

export interface VideoRoomEvent {
  /**
   * False when the request did not prove it came from the provider — a bad
   * or missing signature, or a body that does not match it. Callers write
   * nothing, exactly as PaymentCallbackResult.verified and
   * IdentityVerificationCallbackResult.verified already gate their writes.
   */
  verified: boolean;
  kind: VideoRoomEventKind;
  roomName: string | null;
  participant: VideoParticipant | null;
  occurredAt: Date;
}

export interface VideoConferenceProvider {
  /** Stable key, matching the VIDEO_CONFERENCE_PROVIDERS allowlist. */
  readonly key: string;
  /** Idempotent: creating a room that already exists returns it. */
  createRoom(spec: VideoRoomSpec): Promise<void>;
  /** Local signing, no network call. Never grants room administration, recording or self-renaming. */
  generateJoinToken(grant: VideoJoinGrant): Promise<VideoJoinCredential>;
  /** Idempotent: ending a room that does not exist is success. Disconnects everyone in it. */
  endRoom(roomName: string): Promise<void>;
  /** Empty when the room does not exist. The reconciler's source of truth (§7.6). */
  listParticipants(roomName: string): Promise<VideoParticipant[]>;
  /** Idempotent: removing someone not in the room is success. */
  removeParticipant(roomName: string, identity: string): Promise<void>;
  /** Takes the raw body string: the signature covers the exact bytes (same reason as nID). */
  handleWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<VideoRoomEvent>;
  /** Cheap reachability probe for the settings status line. Never gates boot or readiness. */
  ping(): Promise<boolean>;
}
```

**Why these methods exist.** `createRoom`, `generateJoinToken` and `endRoom` are
the lifecycle. The other four each carry weight in access control:

- `listParticipants` and `removeParticipant` are how a deactivated user leaves a
  live room (§5.5), and how lost webhooks stop mattering (§7.6).
- `handleWebhook` is how attendance becomes a record (§7.5).
- `ping` is how an operator learns the SFU is down before a meeting does.

**What the interface deliberately lacks:**

- No `startRecording`/`stopRecording`: recording is deferred (§10).
- No grant for room administration, recording, or a hidden participant.
  Moderation goes through the API, where it is audited (§5.6), never through a
  capability handed to a browser.

### 4.1 `LiveKitVideoConferenceProvider`

`apps/api/src/core/video/providers/livekit.provider.ts`, built on
`livekit-server-sdk` (Apache-2.0). Each row was checked against LiveKit's own
source (`livekit/livekit` `pkg/service/roomservice.go`,
`livekit/protocol` `webhook/`):

| Method | LiveKit call | What the implementation must get right |
|---|---|---|
| `createRoom` | `RoomServiceClient.createRoom` | On an existing room, LiveKit's allocator "finds the existing room and updates it". That is idempotent, and it also re-applies `maxParticipants`, so the value passed must be the stored one (§6), never a freshly recomputed one. |
| `generateJoinToken` | `AccessToken(apiKey, apiSecret)` + `addGrant` + `toJwt()` | Set explicitly (§5.4): `roomJoin: true`, `room`, `canPublish`, `canSubscribe`, `canPublishData`, `canUpdateOwnMetadata: false`. Never set: `roomAdmin`, `roomCreate`, `roomList`, `roomRecord`, `hidden`, `recorder`. `ttl` = the grant's `ttlSeconds`. |
| `endRoom` | `RoomServiceClient.deleteRoom` | For a missing room LiveKit returns `ErrRoomNotFound` (Twirp `not_found`). **Map that to success**, or the reconciler retries forever. |
| `listParticipants` | `RoomServiceClient.listParticipants` | Map a missing room to `[]`. |
| `removeParticipant` | `RoomServiceClient.removeParticipant` | Map `not_found` to success. |
| `handleWebhook` | `WebhookReceiver(apiKey, apiSecret).receive(rawBody, authorization)` | The server sends `Authorization: <JWT>`. The JWT's `sha256` claim is over the exact body, and `receive()` throws on a mismatch. Catch that and return `{ verified: false }`. Never call it with `skipAuth`. |
| `ping` | `RoomServiceClient.listRooms` with a 2 s timeout | Any error means `false`. |

Webhook events map to kinds as follows:

- `room_started`, `room_finished`, `participant_joined`, `participant_left` and
  `participant_connection_aborted` map to the kind of the same name.
- The `track_*`, `egress_*`, `ingress_*` and `agent_*` events all map to
  `IGNORED`.

### 4.2 `VideoConferenceService`

`apps/api/src/core/video/video-conference.service.ts`, registered as an `@Global`
`VideoModule` imported by `CoreModule`, like `AiModule` and `StorageModule`.

- **Selection.** Providers are filtered by `VIDEO_CONFERENCE_PROVIDERS`, the same
  idiom as `AiService`.
  - The first listed provider is the default for new rooms.
  - Each room remembers its own key (`Meeting.videoProviderKey`). A room is
    always ended by the provider that created it, even after the allowlist
    changes.
- **`isAvailable()`** follows House Rule 8's "isAvailable() before rendering the
  button at all", the idiom `SettingsAdminService.getAi()` already serves.
- **Every call has a timeout**: 5 s for room operations, 2 s for `ping`.
  - A timeout or transport error becomes a typed `VideoProviderUnavailableError`.
  - LiveKit's `ErrNodeLimitReached` becomes `VideoProviderAtCapacityError`,
    because "down" and "full" give the user different messages.
  - The raw SDK error never reaches a controller. This is the degradation
    boundary §9 relies on.
- **Logging.** A Nest `Logger` records operation, room name, provider key,
  outcome and latency. It **never** logs a token, and never a display name.

### 4.3 Environment

Added to `core/config/env.validation.ts` and to all three env templates
(`scripts/check-env-templates.mjs` enforces the templates):

| Variable | Default | Meaning |
|---|---|---|
| `VIDEO_CONFERENCE_PROVIDERS` | `''` | `csv()`, like `AI_PROVIDERS`. Empty means video is off. |
| `LIVEKIT_API_URL` | — | Where the API calls RoomService, e.g. `https://rtc.<domain>`. |
| `LIVEKIT_PUBLIC_URL` | — | What the browser connects to, e.g. `wss://rtc.<domain>`. Must be `wss://` in production. |
| `LIVEKIT_API_KEY` | — | The key name in LiveKit's `keys:` map. |
| `LIVEKIT_API_SECRET` | — | At least 32 characters. Server-only, never exposed. |

The boot refusal has the same shape as the existing AI, SMTP and WhatsApp
checks. If `VIDEO_CONFERENCE_PROVIDERS` includes `livekit` and any of the four
is missing, the API refuses to start and names the missing variables. A
`SETUP_HINTS` entry for the secret says `openssl rand -base64 48`.

A half-configured deployment fails loudly at deploy time, not quietly at the
first meeting.

---

## 5. Access control

Real-time access to what may be a sensitive internal conversation is the one
part of this document that must not be casual. Everything below runs through
the permission and audit machinery the repository already has. **There is no
video bypass of `PermissionsGuard`, `JwtAuthGuard` or `AuditService`.**

### 5.1 The one rule

**A join credential is minted for a `MeetingInvitation` row, never for a
meeting.**

- There is no link that works for whoever holds it. There is no PIN, no guest
  access, and no "anyone in the organization".
- The token's LiveKit `identity` **is** the `MeetingInvitation.id`. Every
  connection LiveKit reports therefore names the exact invitation row that
  authorised it.
- Joining needs no permission key beyond the invitation, for the same reason
  doc 24's `respond()` needs none. The invitation is the grant. It was issued
  by a `notify.send` holder, through `AudienceService.resolve()`, bounded by
  that sender's reach.
- A second, role-level "may join video" key would let a role grant or deny
  access to meetings its holders were never invited to. That is a wider
  authority than the invitation, not a narrower one.

### 5.2 `decideJoin()`: the pure deciding function

`MeetingVideoService.decideJoin(input)` takes loaded rows and a clock, and
returns an outcome. It holds no `prisma.` write and no `publish(`, following
the `preview*()` convention in `.claude/rules/services.md`. It has two callers:

- `issueJoin()`, which mints the token;
- the "My meetings" list, which uses it read-only to render each row's Join or
  "opens at" state.

The list and the room therefore can never disagree about whether a person may
join.

Inputs:

- the meeting and the caller's invitation (or `null`);
- `user.isActive`;
- whether the provider is available;
- `now`;
- the two window settings.

Checks run in this order. The first failure wins:

| # | Refusal | HTTP | Message states the remedy (FLO-7) |
|---|---|---|---|
| 1 | meeting not found | 404 | — |
| 2 | no invitation row for this user on this meeting | 403 | "You were not invited to this meeting." The same wording `respond()` uses. |
| 3 | `cancelledAt` set | 409 | "This meeting was cancelled." |
| 4 | `videoProviderKey` is null | 409 | "This meeting has no video room. Meet at: `location`." (or "Ask the organiser"). |
| 5 | `videoEndedAt` set | 409 | "The video room has ended (`videoEndedReason`)." |
| 6 | `now < startsAt − joinOpensMinutes` | 409 | "The room opens at `startsAt − joinOpensMinutes`." |
| 7 | `now > endsAt + overrunMinutes` | 409 | "The room closed at `endsAt + overrunMinutes`." |
| 8 | provider key not in the allowlist, or the provider is unreachable | 503 | "Video is unavailable right now. The meeting itself stands: `location`." |

The `respond()` response is **not** a check. A person who declined may still
join. An RSVP records intent; it is not an access grant, and people change
their minds.

### 5.3 The join route

```ts
@Post(':id/video/join')
@AuthenticatedOnly()   // the invitation, checked in the service, is the grant — as respond()
@SessionOnly()         // mints a credential: no personal API key may, whatever it carries
@Throttle({ default: { limit: 10, ttl: 60_000 } })
joinVideo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Ip() ip: string)
```

`@SessionOnly()` is required by `.claude/rules/security.md`: "a route that
issues … a credential … carries `@SessionOnly()`."

- Without it, an `nxa_` key belonging to an invitee could mint join tokens from
  a script, turning an integration credential into a listening device.
- `SESSION_ONLY_ROUTES` in `apps/api/test/session-only-routes.spec.ts` gains
  `[MeetingsController, 'joinVideo', 'mints a video join credential']`. That
  spec fails the moment the marker is dropped.
- An inactive user never reaches the handler, because `JwtStrategy.validate()`
  already refuses `isActive: false`.

`MeetingVideoService.issueJoin()`:

1. Load the meeting, the caller's invitation and the invitation count, then run
   `decideJoin()`. Refuse with the outcome.
2. `provider.createRoom({ name: videoRoomName, maxParticipants, emptyTimeoutSeconds: 120, departureTimeoutSeconds: 300 })`.
   The room is created **lazily, on the first join inside the window**, never
   at attach time. LiveKit's `empty_timeout` would close a room created days
   ahead before anyone arrived. It is called on every join (it is idempotent),
   so a full node answers here. On unavailability or capacity, return 503 with
   the matching message and write nothing.
3. `provider.generateJoinToken(…)` with `ttlSeconds = min(120, secondsUntil(endsAt + overrunMinutes))`.
4. In one transaction, call `AuditService.recordEvidence(tx, { action: 'meeting.video.join_issued', entity: 'MeetingInvitation', entityId: invitation.id, actorId, ip, data: { meetingId, windowOpensAt, windowClosesAt, ttlSeconds } })`.
   - **This is evidence-class** under ruling 9: a grant of access to a
     conversation is recorded or not issued. If the write fails, the token is
     discarded and the request fails.
   - Honest limit: `AuditLog` has no immutability trigger yet (ruling 1's
     prerequisite), so this trail is transactional, not tamper-evident. That is
     `AuditService.recordEvidence()`'s own stated limit.
5. Return `{ serverUrl: LIVEKIT_PUBLIC_URL, token, expiresAt, isHost }`. The
   response carries `Cache-Control: no-store`.

### 5.4 What the token grants

| LiveKit grant | Value | Why |
|---|---|---|
| `identity` | `MeetingInvitation.id` | Ties every connection to the row that authorised it. Carries no personal data into LiveKit's logs. |
| `name` | the user's name, built server-side as `MeetingsService.cancel()` builds it (`[firstName, lastName]`) | A participant cannot type a name, so cannot appear as someone else. |
| `roomJoin`, `room` | `true`, `videoRoomName` | Exactly one room. |
| `canPublish`, `canSubscribe`, `canPublishData` | `true` | It is a meeting, not a webinar. |
| `canUpdateOwnMetadata` | `false` | No renaming yourself mid-meeting. |
| `roomAdmin`, `roomCreate`, `roomList`, `roomRecord`, `hidden`, `recorder` | never set | Moderation is API-side and audited. No token can create a room, list rooms, record, or join invisibly. |
| `attributes` | `{ role: 'host' }` for the caller's own invitation, else `{}` | Lets the room page label the host. Carries no authority. |
| `ttl` | at most 120 s, and never past window close | Long enough to connect, and no longer. |

### 5.5 Why the TTL does not end a session, and what does

LiveKit's `RoomManager` re-signs every connected participant's token every five
minutes. The refreshed token is valid for at least ten minutes, or the
original's remaining life if that is longer (`tokenRefreshInterval`,
`tokenDefaultTTL` in `pkg/service/roommanager.go`).

So a 120-second token ends only the *connect handshake*. It never ends a live
session. Five things close sessions from the server side instead:

1. **`room.auto_create: false`** in LiveKit's config (§8.3).
   - LiveKit's default is `true`. Under the default, a still-valid refreshed
     token for a deleted room would create the room again on reconnect.
   - With `false`, joining a room the API has not created fails. Every
     server-side end below is therefore final.
2. **The window closes.**
   - At `endsAt + overrunMinutes`, the reconciler (§7.6) calls
     `endRoom()`. That disconnects everyone.
   - It then sets `videoEndedAt` with reason `WINDOW_CLOSED`.
3. **The meeting is cancelled.**
   - `MeetingsService.cancel()` calls `endVideo(CANCELLED)` after its own
     update. The call is best-effort.
   - The reconciler retries anything that did not end.
4. **The host ends it** (§5.6).
5. **A deactivated user is removed.**
   - `UsersAdminService.update()` publishes no event on deactivation, and this
     document does not add one to `users`.
   - Two paths cover it instead.
   - **Admission re-check.** On every `participant_joined` webhook, the API
     checks four things: the identity is an invitation on this meeting, its
     user is active, and the meeting is neither cancelled nor ended. If any
     check fails, it calls `removeParticipant()` at once.
   - **Sweep.** Every reconciler tick lists the participants of each live room
     and removes any whose user is now inactive.
   - **Residual, stated rather than hidden:** a deactivated user who is already
     in a room keeps hearing it until the next tick, at most 60 seconds. After
     removal, the only credential they hold is a refreshed token of at most ten
     minutes. Any reconnect with it trips the admission re-check.
   - **The tighter path:** a `UserDeactivated` domain event from `users`, which
     would let `notify` react within the outbox dispatch interval. That is a
     separate decision about a core module's event surface, recorded under Out
     of scope. It is not taken silently here.

A participant whose identity matches **no** invitation on the room's meeting is
also removed at admission. This can only happen if the API secret has leaked.
It is logged at `error` as a possible credential leak, and `docs/video.md`'s
runbook rotates the key (§8.10).

### 5.6 The host

**The host is an invitee.** Attaching video materialises the caller's own
`MeetingInvitation`:

- created with `required: false`, so it never enters doc 24's shortfall report;
- using `upsert` on `@@unique([meetingId, userId])` with an empty update, so a
  caller who is already in the audience keeps their row unchanged;
- with no notification sent.

The one rule in §5.1 therefore holds with no exception for the organiser.

**Host actions go through the API.** No token ever carries `roomAdmin`.

| Action | Route | Gate |
|---|---|---|
| Attach a room | `POST :id/video` (+ `GET :id/video/preview`) | `notify.send`, plus `actorId === meeting.calledByUserId`: the same caller-only check `cancel()` makes. |
| End for everyone | `POST :id/video/end` | `notify.send` + caller-only. Confirmed in the UI with the live participant count (ACT-6). Final: joins are refused afterwards. |
| See who actually joined | `GET :id/video/attendance` | `notify.send` + caller-only. Paginated. **Not** the shortfall route's unchecked shape (§1). |

**Auditing.** Each host action writes an operational `AuditService.record()` row:

- `meeting.video.attached`, carrying `{ invitationCount, capAtAttach }`;
- `meeting.video.ended`, carrying `{ reason }`.

Neither is a money or permission change, so ruling 9 classes both as
operational. That classification is stated here rather than implied.

### 5.7 Deliberately not here

- **Guest links for people outside the deployment.** They would be a second
  identity system.
- **Uninviting one person.** Doc 24 has no invitation revocation, and "remove"
  without revoke is pointless, since the person may rejoin.
- **Per-participant mute or kick by the host.**
- **A waiting room.**

Each is named under Out of scope. None is half-built.

---

## 6. Schema changes

`apps/api/prisma/schema/notify.prisma`, via one hand-written, forward-only
migration (`.claude/rules/database.md`). All changes are additive:

- every new `Meeting` column is nullable, with the meaning of `NULL` written
  beside it;
- there is no backfill: an existing meeting has no video, which is exactly
  what `NULL` means.

```prisma
model Meeting {
  // … every existing field unchanged …

  /// Which VideoConferenceProvider owns this meeting's room (`livekit`).
  /// NULL means no video room: the meeting is exactly what doc 24 built —
  /// a time, a place and a required response — and fully valid as that.
  /// Set once by MeetingVideoService.attach() via a predicate-on-write
  /// (`updateMany where videoProviderKey: null`), never overwritten.
  videoProviderKey String?
  /// The provider-side room name, generated, never typed: `mtg-<meeting.id>`
  /// on a STANDALONE node, `mtg-<NODE_ID>-<meeting.id>` otherwise — the
  /// same node-folding rule as documentNumber()'s basePrefix(). NULL iff
  /// videoProviderKey is NULL.
  videoRoomName    String?  @unique
  /// When joining became permanently impossible. NULL while the room may
  /// still be joined inside its window. Set once (predicate-on-write
  /// `where videoEndedAt: null`), by the reconciler, by cancel(), or by
  /// the host.
  videoEndedAt     DateTime?
  /// Why. NULL iff videoEndedAt is NULL.
  videoEndedReason MeetingVideoEndReason?

  videoAttendance MeetingVideoAttendance[]
}

enum MeetingVideoEndReason {
  WINDOW_CLOSED
  CANCELLED
  ENDED_BY_HOST
}

model MeetingInvitation {
  // … every existing field unchanged …
  videoAttendance MeetingVideoAttendance[]
}

/// One connection to a meeting's video room — the RECORD that someone was
/// actually present, distinct from doc 24's RSVP (intent) and from the
/// `meeting.video.join_issued` AuditLog row (a credential was granted).
/// Written from the provider's webhooks and backfilled by the reconciler
/// from listParticipants(), so a dropped webhook costs precision, never
/// the row. Stores no name: the invitation resolves the person.
model MeetingVideoAttendance {
  id           String   @id @default(cuid())
  meetingId    String
  invitationId String
  /// The provider's id for this one connection (LiveKit participant SID).
  /// Unique: a redelivered participant_joined, or the reconciler finding a
  /// participant a webhook already recorded, is a no-op (P2002 swallowed).
  providerParticipantId String @unique
  joinedAt     DateTime
  /// NULL while connected (as far as this node knows).
  leftAt       DateTime?
  /// NULL iff leftAt is NULL. RECONCILED means "left at or before leftAt".
  leftReason   MeetingVideoLeaveReason?

  meeting    Meeting           @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  invitation MeetingInvitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)

  @@index([meetingId, leftAt])
  @@index([invitationId])
}

enum MeetingVideoLeaveReason {
  LEFT
  CONNECTION_ABORTED
  REMOVED
  ROOM_ENDED
  RECONCILED
}
```

**Indexes, justified by the queries that use them:**

- **`@@index([meetingId, leftAt])`** serves two queries: the host's attendance
  list, and the reconciler's "open rows for this meeting"
  (`where meetingId, leftAt: null`).
- **`@@index([invitationId])`** serves the cascade, and the admission
  re-check's lookup from identity to attendance.
- **A hand-written partial index** in the migration, following the
  `org_unit_code_group_wide` precedent in
  `20260926080000_add_org_structure/migration.sql`:
  `CREATE INDEX "meeting_video_open_by_end" ON "Meeting" ("endsAt") WHERE "videoProviderKey" IS NOT NULL AND "videoEndedAt" IS NULL;`.
  - The reconciler runs every minute. Without this, a composite index on
    `(videoEndedAt, endsAt)` would scan every historical non-video meeting,
    all of which also have `videoEndedAt IS NULL`.
  - With it, the scanned set is only the video meetings not yet ended: a
    handful at any moment.

**Three `SettingKey`s** go in `core/settings/settings.defaults.ts`. They are
read through `SettingsService` and clamped in the service, so an out-of-range
stored value can never produce an out-of-range room:

| Key | Default | Clamp | Meaning |
|---|---|---|---|
| `MeetingVideoJoinOpensMinutes` (`notify.video.join_opens_minutes`) | 15 | 0–120 | How early before `startsAt` joining opens. |
| `MeetingVideoOverrunMinutes` (`notify.video.overrun_minutes`) | 30 | 0–240 | How long after `endsAt` the room stays open. |
| `MeetingVideoMaxParticipants` (`notify.video.max_participants`) | 25 | 2–200 | Attach is refused when the meeting's invitations, host included, exceed this. |

The default of 25 is a policy starting point, not a measurement. §8.9's load
test on the deployment's own host decides whether it stays.

**`maxParticipants` passed to `createRoom()` equals the invitation count**,
which is fixed at materialisation. It is therefore stable across the lazy
re-creations LiveKit's `CreateRoom`-updates-existing behaviour allows (§4.1).
Because of LiveKit's duplicate-identity rule, one invitation holds at most one
live seat.

---

## 7. The flows

### 7.1 Attach: at creation, or later

- **At creation.** `CreateMeetingDto` gains an optional `video?: boolean`.
  `create()` calls `attach()` inside its own transaction, after the invitations
  are materialised.
- **Later.** `POST :id/video` does the same for an existing meeting.

`decideAttach()` is pure. `previewAttach()` returns its outcome, the invitation
count and the cap, and the UI shows that before the host commits. Attach
refuses in these cases:

- the actor is not the caller;
- the meeting is cancelled;
- it already has video (idempotent success: the existing room is returned);
- `now > endsAt + overrunMinutes`;
- no provider is allowlisted (409: "Video rooms are not set up on this
  deployment");
- invitations exceed the cap (409, naming both numbers: "Narrow the audience,
  or raise the cap in Settings").

Attach needs the provider **configured, not reachable**. It is a pure database
write. The LiveKit room is created at first join. Attaching while the SFU is
down still succeeds, and a join later degrades as §9 describes.

**The write.** `updateMany({ where: { id, videoProviderKey: null, cancelledAt: null }, data: { videoProviderKey, videoRoomName } })`.
A count of 0 re-reads the row and returns the existing room (House Rule 10).
The host's invitation upsert goes in the same transaction.

**After commit.** Invitees other than the host each receive one
`notify.meeting_video_added` notification through the unchanged
`NotificationsService`. It links to the meeting's page, never to a room or a
token.

For a meeting created with video, the existing `notify.meeting_invite` body
gains the same link, and no second message is sent.

### 7.2 Join

The steps are in §5.3. On the client:

1. The room page calls the join route.
2. It dynamically imports `livekit-client`.
3. It connects with the returned `serverUrl` and `token`.

The token is used once and never stored: not in `localStorage` and not in the
URL. A reload fetches a new one through the same checks.

### 7.3 End

There are three triggers:

- the window closes (reconciler);
- `cancel()`;
- the host.

All three go through one method,
`MeetingVideoService.endVideo(meeting, reason)`:

1. `provider.endRoom()`, idempotent.
2. `updateMany where videoEndedAt: null`, setting `videoEndedAt` and the reason.
3. Close every open attendance row with `leftReason: ROOM_ENDED`.

If step 1 fails (unavailable), nothing is set. The reconciler retries on its
next tick (§7.6).

### 7.4 In the room

§11.3 covers the screen. Two behaviours are load-bearing:

- **When LiveKit disconnects the client** (room deleted, participant removed,
  or duplicate identity), the page shows the reason and a forward action. It
  does not show a spinner that never ends.
- **When the client reconnects**, it uses LiveKit's own refreshed token. The
  API is not involved.

### 7.5 Webhook intake

- **Route.** `POST /api/v1/webhooks/video/:providerKey` is `@Public()`, like
  nID's `webhook`, and `@Throttle`d, like `webhooks/marketplace`.
  Authenticity comes from the signature, not a session.
  - An unknown or non-allowlisted `providerKey` returns 404.
  - The controller passes `req.body` (bytes) and `req.headers` to the service.
    The service never imports Express, so `scripts/check-hexagonal-purity.mjs`
    passes.
- **Body parsing.** LiveKit sends `Content-Type: application/webhook+json`.
  Its own source explains why: "use a custom mime type to ensure signature is
  checked prior to parsing" (`livekit/protocol` `webhook/consts.go`).
  - Nest's default JSON parser does not match that type, so `req.rawBody`
    would be empty, and **every genuine webhook would fail verification**.
  - `main.ts` therefore registers
    `app.useBodyParser('raw', { type: 'application/webhook+json' })`.
  - The body arrives as bytes, is verified, and only then is parsed by the
    provider: the order LiveKit's MIME type exists to force.
  - A spec posts that content type and asserts that the handler received the
    exact bytes.
- **Verification.** When `verified === false`, the API returns 401, writes
  nothing, and logs a `warn` with the source IP. This is the one sanctioned
  exception to "a record is never refused": an authenticity failure.
- **Routing.** The room name maps to `Meeting` through the unique
  `videoRoomName`.
  - An unknown room gets `200` and a `debug` log. That covers a room from
    before a database restore, or another node's room.
  - It is never an error, so LiveKit does not retry it forever.

What each event writes:

| Event | Write |
|---|---|
| `participant_joined` | Run the admission re-check (§5.5). Then `create` an attendance row (`joinedAt` = the participant's own `joinedAt`), swallowing P2002. The row is written **even when admission then removes the person**, because the connection happened (RECORD). The removal closes it with `REMOVED`. |
| `participant_left` / `participant_connection_aborted` | `updateMany where providerParticipantId, leftAt: null`, setting `leftAt` and `LEFT` or `CONNECTION_ABORTED`. |
| `room_finished` | Close the room's open rows with `ROOM_ENDED`. **Does not set `videoEndedAt`.** The room may have emptied, and a later join inside the window re-creates it. |
| `room_started`, `IGNORED` | Nothing. |

**Webhook delivery is best-effort, by LiveKit's own design.**

- The notifier retries (`retryablehttp`), but its queue is created
  `DropWhenFull: true` (`livekit/protocol` `webhook/url_notifier.go`).
- Nothing correct may depend on every webhook arriving. §7.6 is what makes a
  dropped one harmless.

### 7.6 `MeetingVideoReconcileCron`

`apps/api/src/modules/notify/meeting-video-reconcile.cron.ts`, `@Cron('* * * * *')`.

- It is a self-initialising provider, like `EscalationCron`, and listed in
  `NotifyModule`.
- It no-ops when `VideoConferenceService.isAvailable()` is false.
- Each tick works over the partial index's rows only, in three passes:
  1. **Close what must close.**
     - Scope: rows with `cancelledAt` set, or with
       `endsAt + overrunMinutes < now`.
     - Action: `endVideo(WINDOW_CLOSED | CANCELLED)`.
  2. **Reconcile what is live.**
     - Scope: rows inside their window.
     - Call `listParticipants(room)`. An empty list costs one call and nothing
       else.
     - A participant with no attendance row gets one: this is the lost-webhook
       backfill, idempotent on `providerParticipantId`.
     - An open row whose participant is absent is closed with `RECONCILED`
       and `leftAt = now`, meaning "left at or before".
  3. **Remove who must go.**
     - Scope: participants from pass 2.
     - An identity whose invitation's user is inactive, or which matches no
       invitation, is removed with `removeParticipant()`.
     - Each removal writes a `meeting.video.participant_removed` operational
       audit row with no actor, labelled system.

The passes are idempotent under overlap, through predicate-on-write and the
unique participant id. A second API replica, if one ever exists, is safe
without a lock.

---

## 8. Deployment

### 8.1 Where it runs

**LiveKit is its own Coolify Docker Compose resource,** `docker-compose.video.yml`,
in the same project and environment as the deployment's Postgres and Redis.
This is exactly how `docker-compose.mail.yml` runs Stalwart:

- it is not in the `api` container;
- it is not a process `apps/api` starts;
- it is not the `docker-compose.prod.yml`/Swarm/Caddy path, which
  `DEPLOYMENT.md` calls superseded.

**It uses no Redis and no database.** LiveKit needs Redis only to run as
several nodes (its sample config: "when redis is set, LiveKit will
automatically operate in a fully distributed fashion"). Multi-node and
multi-region are out of scope. A single node keeps room state in memory, and
there is nothing to back up (§8.10).

**It runs one LiveKit per deployment, never shared across deployments.**
LiveKit's `webhook.urls` is server-global: every room's events go to every
listed URL. A LiveKit shared between two tenant deployments would send each
tenant's participant names and room activity to the other.

That is the same reason doc 39's shared hosting tier "shares infrastructure,
never a database". Here, the webhook stream is the data.

Meetings are node-local rows (nothing registers `Meeting` with the replication
registry). At Chain or Organization edition, video therefore follows the node
the meeting was called on, and a node enables it only by pointing at a LiveKit
whose `webhook.urls` lists that node.

**It starts co-located.** The first deployment runs on the existing Coolify
server, as Stalwart does, with hard caps: container CPU and memory limits, and
LiveKit's own `limit.bytes_per_sec`.

Moving it to a second Coolify server later is a resource relocation plus a DNS
change. The API knows only URLs, so the move needs no code change. §8.9 says
when to move.

### 8.2 `docker-compose.video.yml`

```yaml
# Video SFU — deployed as a Coolify resource
# (docs/implementation/tasks-notifications-support/205-self-hosted-video-meetings-livekit.md).
#
# Add this in Coolify as a Docker Compose resource in the SAME project and
# environment as the api. Set the resource's domain to rtc.<domain> so
# Traefik routes and certificates signalling (HTTP + WebSocket on 7880).
# Media is not HTTP: the ports below are published on the host directly,
# exactly as docker-compose.mail.yml publishes SMTP/IMAP.

services:
  livekit:
    image: livekit/livekit-server:vX.Y.Z   # pinned at WO-205.7, as stalwart:v0.13.4 is; never :latest
    restart: unless-stopped
    environment:
      # The whole of deploy/video/livekit.yaml — no secrets in it.
      LIVEKIT_CONFIG: ${LIVEKIT_CONFIG:?paste deploy/video/livekit.yaml}
      # "<key>: <secret>" — the same pair the api resource holds as
      # LIVEKIT_API_KEY / LIVEKIT_API_SECRET. Two pairs during a rotation.
      LIVEKIT_KEYS: ${LIVEKIT_KEYS:?set to "<key>: <secret>"}
      # The host's public IP. Explicit rather than STUN-discovered: behind
      # Docker's NAT the discovered address is the thing most likely wrong.
      NODE_IP: ${NODE_IP:?set to the server's public IPv4}
    ports:
      - '7881:7881/tcp'              # ICE over TCP. LiveKit: "cannot be behind load balancer or TLS"
      - '7882-7885:7882-7885/udp'    # WebRTC media, UDP mux — one port per host vCPU (LiveKit's guidance)
      - '3478:3478/udp'              # TURN/UDP
      # Deliberately NOT 80/443/7880: Traefik owns those. TURN/TLS rides 443
      # through a Traefik TCP router (§8.6); signalling rides the resource domain.
    healthcheck:
      # 127.0.0.1, not localhost — the same Alpine resolver trap
      # docker-compose.prod.yml's api healthcheck documents. LiveKit's
      # root handler answers "OK".
      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:7880']
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s
    deploy:
      resources:
        limits:
          # Initial caps, not measurements — revised from WO-205.7's load test.
          cpus: '2.0'
          memory: 1G
```

### 8.3 `deploy/video/livekit.yaml`

This file is committed and contains no secrets. Every key below exists in
LiveKit's `config-sample.yaml`.

```yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882-7885        # UDP mux; port_range_start/end must stay unset for this to apply
  use_external_ip: false     # node_ip comes from NODE_IP; STUN discovery off
turn:
  enabled: true
  domain: turn.<domain>
  tls_port: 5349             # plain TCP inside the container; Traefik terminates TLS on 443 (§8.6)
  external_tls: true
  proxy_protocol: true       # Traefik dials from its own address; without this Firefox rejects the mapped address
  proxy_protocol_trusted_cidrs:
    - <coolify-network-cidr> # the Docker network Traefik sits on — read from `docker network inspect`, never guessed
  udp_port: 3478
  per_user_relay_allocation_limit: 12   # LiveKit's default, stated so it is a decision
  ttl_seconds: 300                      # per-participant TURN credential life (LiveKit's default)
room:
  auto_create: false         # §5.5 — the setting that makes every server-side end final
  # No max_participants here: LiveKit's own sample notes that rooms created
  # explicitly with CreateRoom take their settings from the request, and
  # every room here is explicit — the invitation count passed by the API is
  # the per-room ceiling (§6).
  empty_timeout: 120
  departure_timeout: 300
limit:
  # The server-side ceiling: a full node denies entry (ErrNodeLimitReached,
  # pkg/service/roomallocator.go). Set at WO-205.7 from the host's measured port speed.
  bytes_per_sec: <measured>
webhook:
  api_key: <key name from LIVEKIT_KEYS>
  urls:
    - https://api.<domain>/api/v1/webhooks/video/livekit
logging:
  level: info
  json: true
```

### 8.4 Ports and routes

| Purpose | Port | Path in | TLS |
|---|---|---|---|
| Signalling + RoomService API | 7880/tcp (in container) | Traefik HTTP router, domain `rtc.<domain>` on the resource | Traefik's ACME certificate |
| TURN/TLS | 443/tcp public, then 5349 in the container | Traefik **TCP** router, `HostSNI(turn.<domain>)` | Traefik terminates, forwards plain with PROXY v2 |
| TURN/UDP | 3478/udp | host-published | none needed (STUN/TURN auth) |
| WebRTC media | 7882–7885/udp | host-published | DTLS-SRTP, end to end |
| ICE over TCP | 7881/tcp | host-published | DTLS-SRTP |

The host firewall (the provider panel and/or `ufw`) must allow 3478/udp,
7881/tcp and 7882–7885/udp. It must allow **nothing else new**: 7880 and 5349
are never published on the host. The Prometheus port stays unset (§8.10).

### 8.5 TURN: LiveKit's built-in server, not a separate coturn

**Chosen: LiveKit's embedded TURN.** Five reasons:

1. **Per-participant, short-lived credentials by construction.** LiveKit hands
   each participant its own TURN credentials during signalling (`ttl_seconds`,
   default 300). A coturn deployment would need either a long-lived static
   secret or a second credential-minting path that NEWAX writes and secures.
2. **Relays only to the SFU.** It exists to reach LiveKit.
   - A general-purpose coturn is an open relay unless every internal range is
     denied peer by peer. A missed range makes the TURN server a proxy into
     the Coolify network.
   - The built-in server removes that class of misconfiguration, rather than
     guarding against it.
3. **Built-in abuse quota.** `per_user_relay_allocation_limit` stops one
   participant from exhausting relay ports for everyone else.
4. **One resource, one config, one image to patch.** There is no second
   service, secret, or upgrade cadence.
5. **What coturn would buy does not apply here.** Its advantages are
   independent scaling and a separate public IP. Both matter at a scale this
   contained feature explicitly does not target.

**Revisit the choice when** measured relay traffic, not guessed traffic,
saturates the co-located host. That is a signal to move LiveKit to its own
server (§8.9) before it is a signal to split TURN out.

### 8.6 TLS for TURN

TURN/TLS on **443** is what gets through corporate firewalls that block
everything except HTTPS, which is the case TURN exists for. Traefik already
owns 443, and a Traefik TCP router with `HostSNI` can share 443 with the HTTP
routers. Traefik applies TCP routers first and falls through to HTTP when no
SNI matches.

The resource therefore carries Traefik labels for:

- a TCP router `HostSNI(\`turn.<domain>\`)` on the HTTPS entrypoint;
- TLS from the Coolify proxy's certificate resolver;
- a TCP service to `livekit:5349` that sends PROXY protocol v2.

The exact entrypoint and resolver names, and whether the installed Traefik
major version sets PROXY on the service or on a `serversTransport`, are read
from Coolify → Proxy at WO-205.7, not assumed here.

**Fallback,** if the Coolify proxy cannot carry a TCP router: publish 5349
directly and give LiveKit its own certificate (`LIVEKIT_TURN_CERT`/
`LIVEKIT_TURN_KEY`). That reopens the certificate problem `docs/email.md`
step 6 already solved for SMTP, and the same answer applies: ACME DNS-01 after
a move to Cloudflare DNS, or extraction from Traefik's `acme.json` as the
worse fallback.

It is strictly worse on reach too, since 5349 is blocked where 443 is not. It
is the fallback, not the plan.

### 8.7 DNS

| Type | Name | Value |
|---|---|---|
| A | `rtc.<domain>` | the Coolify server's public IP |
| A | `turn.<domain>` | the same IP |

No MX, PTR or SPF records are needed. Video has none of email's reputation
problem.

### 8.8 How `apps/api` reaches it

- The API resource's Coolify env gains the five variables in §4.3.
  `LIVEKIT_API_URL=https://rtc.<domain>` uses the public name, so TLS
  verification matches the certificate.
- The alternative is an internal network alias for `rtc.<domain>` on the
  LiveKit container. It avoids the hairpin out and back, and the certificate
  still matches: the same trade `docs/email.md` step 9 describes for
  `SMTP_HOST`.
- **The fix for a hostname mismatch is never to turn verification off.**
- Every RoomService call is authorised by a JWT the SDK signs per call with
  the API secret. The secret itself never crosses the wire.

### 8.9 Capacity: a formula, a cap, and a measurement

An SFU forwards media and never transcodes. For a room of *N* participants,
each with a camera on:

- server ingress ≈ *N* × *r*<sub>pub</sub> (simulcast publishes up to three
  layers per camera);
- server egress ≈ *N* × (*N* − 1) × *r*<sub>sub</sub>, where
  *r*<sub>sub</sub> is the layer LiveKit's adaptive stream selects for each
  subscriber's tile size;
- a screen share adds one track to *N* − 1 subscribers;
- a participant relayed through TURN crosses the host's interface twice.

This repository will not invent the resulting number, following
`DEPLOYMENT.md` §9's rule for RTO. WO-205.7 measures it instead:

1. Read the host's port speed from the provider panel.
2. Run LiveKit's own load tester (`lk load-test`) against the real resource, at
   `MeetingVideoMaxParticipants`' default, while the shop's own traffic runs.
3. Record CPU, egress and packet loss in `docs/video.md`, with the date.
4. Set `limit.bytes_per_sec` to a stated fraction of the measured port speed,
   so that video degrades itself before it degrades checkout. A node at its
   limit denies entry (`ErrNodeLimitReached`).
5. Keep or lower the cap of 25 from that measurement.

**Move to a dedicated Coolify server when** the measured peak for real meetings
approaches the cap, or when the shop's own latency moves during a meeting.
Whichever comes first.

### 8.10 Operating it

This is new infrastructure the team runs, not just new code.

`docs/video.md`, written at WO-205.7 as `docs/email.md` was, is the runbook:

- **Updates.** Pin an exact image tag. Read LiveKit's release notes before
  bumping. Bump staging first. Treat a LiveKit release like a dependency
  upgrade, with a stated reason.
- **Key rotation.** `LIVEKIT_KEYS` accepts several `key: secret` pairs, which
  gives a zero-downtime rotation:
  1. Add the new pair to LiveKit.
  2. Switch the API's `LIVEKIT_API_KEY`/`_SECRET` and redeploy.
  3. Switch `webhook.api_key`.
  4. Remove the old pair.

  This is also the incident response to §5.5's "identity matches no
  invitation" log line.
- **Backups.** There is nothing to back up. LiveKit is stateless here:
  - its config is committed;
  - its secrets live in Coolify;
  - every fact worth keeping (who was granted, who attended, when it ended) is
    written to Postgres, which Coolify's existing backup already covers.
- **Logs.** JSON to the Docker log driver. Set a `max-size`/`max-file` on the
  resource. Identities are invitation cuids, not names (§5.4). WO-205.7 checks
  a real log line for whether display names appear, and records the answer.
- **Health.** The container healthcheck (§8.2), and `ping()` on the settings
  screen (§11.4).
- **Monitoring, honestly.** LiveKit can expose Prometheus metrics
  (`prometheus_port`), but nothing in this codebase scrapes metrics. The
  Observable row in `CLAUDE.md` says so. The port stays unset, and adopting a
  metrics backend is a `DECISIONS.md` decision, not an assumption.
  **Today, video monitoring is structured logs plus the healthcheck, and no
  more.**

---

## 9. Failure modes

**A `Meeting` with no video room is a valid, fully functional meeting.**
Scheduling, invitations, RSVP, the shortfall report, cancellation, the
invite notifications and doc 24's escalation all predate this feature. None of
them reads a video column. None of them calls `VideoConferenceService`, except
`cancel()`'s best-effort `endVideo()`, which runs after its own write and never
fails it.

The media server being down, slow or misconfigured degrades one button. It
never blocks doc 24's workflow.

| Failure | What people see | What is recorded | Recovery |
|---|---|---|---|
| LiveKit down, or `createRoom` times out | Join returns 503: "Video is unavailable right now. The meeting itself stands" plus `location`. RSVP and everything else work. | Nothing new: no audit row, since no credential was issued. Logger `warn`. | Automatic when LiveKit returns. The healthcheck restarts the container. The status line on `/admin/settings` shows unreachable. |
| API down, LiveKit up | **People already in the room carry on.** Media is browser-to-LiveKit, and LiveKit refreshes their tokens itself. No one new can join, because tokens are minted only by the API. | Webhooks fail, are retried by LiveKit, then dropped. | On recovery, the reconciler's pass 2 backfills attendance from `listParticipants()` and closes rows for anyone gone, with `RECONCILED`. Only exact departure times inside the outage are lost. |
| Token issued, client never connects (tab closed, network) | Nothing. | The `join_issued` audit row exists with no attendance row: the honest record of "granted, never used". | The token expires within 120 s. `empty_timeout: 120` closes a room nobody entered, and the next join re-creates it. |
| Room created, nobody ever joins (the "room never starts" case) | Nothing. | Nothing. | LiveKit closes it after `empty_timeout`. The reconciler's `endRoom()` at window close is then a `not_found`, mapped to success. |
| LiveKit restarts mid-meeting | Everyone is disconnected. The page shows "The video room was interrupted" with **Rejoin**. | Open attendance rows are closed with `RECONCILED` on the next tick. | Rejoin calls the join route, which re-creates the room (`auto_create: false` means only the API can). |
| A webhook is dropped | Nothing. | A row appears a tick later, or its `leftAt` is approximate. | The reconciler. The data model never assumes delivery. |
| A webhook is forged or tampered with | Nothing. | 401. Zero rows. `warn` with IP. | None needed. |
| `endRoom` fails at window close | People inside may continue past `endsAt + overrun` until it succeeds. | `videoEndedAt` stays `NULL`, so the row stays in the partial index. Logger `error` names the meeting on every failed tick. | Retried every minute, and the host's **End for everyone** calls the same idempotent path. LiveKit's own `departure_timeout` ends it once empty. |
| TURN relay capacity (ports or bandwidth) | New relayed participants fail to connect. The page says the connection could not be established and suggests another network. Direct UDP participants are unaffected. | Logger `warn` from the client error report. | `per_user_relay_allocation_limit` stops one participant from monopolising the relay. Measured saturation triggers §8.9's move. |
| UDP blocked by a corporate network | Transparent: ICE falls back to TCP on 7881, then TURN/TLS on 443. | — | — |
| `limit.bytes_per_sec` reached | `createRoom` meets `ErrNodeLimitReached`, and a new joiner gets 503: "The video service is at capacity". People already in are unaffected. | Logger `warn`. No audit row, since no credential was issued. | By design: video degrades itself before checkout does. Revisit the measurement. |
| Secret mismatch after a botched rotation | Joins fail, since LiveKit rejects the token. Webhooks fail verification (401). | Logger `error` on both sides. | §8.10 rotation order. The boot check cannot catch a *wrong* secret, only a missing one. |
| Clock skew between API and LiveKit hosts | Tokens rejected as not yet valid or expired. | Logger `error`. | Both run on the same host at first. After a move, NTP on both is part of `docs/video.md`'s checklist. |

Recording failure is not a row: recording is not in this pass (§10).

---

## 10. Recording: deferred, and why

The owner did not ask for recording, and this pass does not build any part of
it. The reasons are concrete, not general caution:

1. **It is a second, heavier service.**
   - LiveKit records through **Egress**, a separate deployable. It needs Redis,
     because LiveKit and Egress talk through it.
   - Room-composite recording runs a headless Chrome to render the layout. Its
     CPU cost is of a different order from forwarding packets.
   - It would force multi-process LiveKit infrastructure onto a feature this
     document keeps single-process.
2. **The storage seam does not fit yet.**
   - `StorageDriver.put()` takes a whole `Buffer`, while a recording is hundreds
     of megabytes to gigabytes. Egress also uploads directly to S3-compatible
     storage itself.
   - `.env.production.example` ships `STORAGE_DRIVER=local`. That writes to
     the api container's `api-prod-uploads` volume, which a separate Egress
     container cannot reach without coupling their filesystems.
   - Doing this properly means one of two designs: a streaming/multipart
     method on `StorageDriver`, or Egress configured against the same bucket
     plus a registration step that records the key through `StorageService`.
     That is a design decision, not a detail, and a recording must never go
     through a second storage mechanism.
3. **Consent and notice.** Recording an internal conversation needs:
   - a visible, unmissable indicator to everyone in the room;
   - a stated rule for who may start one;
   - possibly each participant's acknowledgement.

   That is a policy the owner has not written.
4. **Retention and erasure.** No table in this repository has a retention
   column. Ruling 1's `AuditLog` immutability prerequisite is still open. A
   recording is personal data with no retention clock to hang on.
5. **Access.** Who may watch a recording needs a new permission key, and every
   view needs a read-audit row (the catalogue's "Who read it, not just who
   wrote it"). Neither exists.

**Nothing here forecloses the later phase:**

- `VideoConferenceProvider` gains `startRecording`/`stopRecording` then;
- `roomRecord` stays unset in every token until then;
- the attendance and audit rows here are what a recording's own consent record
  would join to.

The later phase starts with its own ADR on items 2 to 5.

---

## 11. UI: the minimum that makes it reachable

All pages are under `apps/web/src/app/(admin)/admin/(app)/`.

- **Copy.** The admin tree has no message provider (only
  `providers/storefront-providers.tsx` wires `NextIntlClientProvider`), and
  none of its 173 pages uses `messages/*.json`. New copy follows the admin
  tree's existing convention, as doc 24's own meetings page does. That debt is
  recorded here, not widened silently.
- **Shared rules.** Every number and date goes through `@newax/shared`'s
  formatters. Every call goes through `adminFetch`.
- **Dependencies.** `livekit-client` and `@livekit/components-react` are
  imported **dynamically, on the room route only**, so no other admin page's
  bundle grows.
- **Hooks and primitives only.** The room uses `useTracks`,
  `ParticipantTile`, `TrackToggle` and similar, styled with this repository's
  own classes. It does **not** use the prebuilt `<VideoConference>` or
  `@livekit/components-styles`. That stylesheet is a second palette
  (`.claude/rules/ui.md`), and the prebuilt component hard-codes English.

### 11.1 Call a meeting (existing page)

- A **Video room** checkbox appears when `GET /admin/notify/meetings/video/status`
  says `available`.
- When unavailable, it is **not rendered**. This is module-style absence under
  MOD-1, and the layout closes over it.
- Checking it runs `previewAttach` for the audience. Above the cap, the
  checkbox is disabled with a reason naming both numbers (PRM-2).

### 11.2 My meetings: new page `/admin/my-meetings`

- **Nav.** `key: 'my-meetings'`, no `permissions`, `group: 'organization'`,
  `module: 'notify'`. The precedent is `my-tasks`: "everyone signed in has
  tasks to do". Everyone invited has meetings.
- **API.** `GET /admin/notify/meetings/my` is `@AuthenticatedOnly()`.
  - `where: { userId: me }`, cursor-paginated at 20, upcoming first. It is
    served by the existing `@@index([userId, response])`.
  - Each row carries `decideJoin()`'s outcome, computed read-only.
- **Row.** Title, time, location, and the RSVP control. The RSVP control uses
  the existing `respond()` route that nothing called until now.
  - **Join** appears when the room is open.
  - "Opens at 14:45" appears before the window.
  - Nothing video-related appears for a meeting without a room.
- **Host rows** also show:
  - **Add video room** (with the preview);
  - **End for everyone** (with a confirm dialog naming the live count);
  - "*n* joined", which links to the attendance list.
- **States.**
  - Empty (never invited): "No meetings yet". The primary action is a link to
    tasks.
  - Loading.
  - Error, with retry.

### 11.3 The room: new page `/admin/my-meetings/[id]/room`

This page has one job: be in the meeting.

- **Layout.** A tile grid on wide screens. At `xs` 280 and `sm` 380, it becomes
  the active speaker plus a horizontal strip.
- **Controls.** Mic, camera, screen share, leave, and **End for everyone** for
  the host.
  - Targets are at least 44×44.
  - Every control is reachable by keyboard.
  - Layout uses logical properties throughout (Urdu is right-to-left).
- **States,** each with a forward action (ITG-1):

| State | Shows | Forward action |
|---|---|---|
| Connecting | a status line | — |
| Connected | the grid | — |
| Reconnecting | a banner | — |
| Camera or mic blocked by the browser | how to allow it | join listening-only |
| Refused | `decideJoin()`'s message (§5.2) | **Back to my meetings** |
| Ended by host / window closed | the reason | **Back to my meetings** |
| Interrupted | the reason | **Rejoin** |
| Removed | "You were removed from this room" | **Back to my meetings** |

- **Motion.** Speaking indicators use opacity only and respect
  `prefers-reduced-motion`, which switches them to a static outline.

### 11.4 Settings: a section on the existing `/admin/settings` page

`GET`/`PUT /admin/settings/meeting-video` are `@RequirePermission('settings.manage')`,
the same shape as `documents` and `media`.

- **Contents.** The provider status line (configured, reachable), and the three
  numbers with their clamps.
- **Rendering.** Only when `VIDEO_CONFERENCE_PROVIDERS` is non-empty. No new
  nav entry, following Law 3.
- **Audit.** A change writes `AuditService.record()` with `{ from, to }`. Under
  ruling 9 this is operational: the values are neither money nor permission.

---

## Dependencies

Following `.claude/rules/dependencies.md`, each package carries a dependency
block.

```
Dependency: livekit-server-sdk (apps/api) — Apache-2.0; runtime deps @bufbuild/protobuf, @livekit/protocol, jose
Purpose: sign join tokens, call LiveKit's RoomService, verify its webhooks
Existing Alternative: @nestjs/jwt (present) for signing + fetch for Twirp + hand-rolled webhook verification
Why Existing Alternative Is Insufficient: the VideoGrant claim schema, the Twirp RoomService contract and the webhook's sha256 claim are LiveKit's protocol to evolve; a hand copy drifts silently on the next server upgrade, and a verification bug here is a forged-attendance bug
Security Considerations: server-only; the secret never leaves the API; jose is the JWT library the SDK signs and verifies with
Maintenance Considerations: maintained by the server's own authors; pinned exact, bumped with the server image
Bundle / Runtime Impact: API process only; no web bundle
Approval Required: yes — this document and ADR-074

Dependency: livekit-client (apps/web) — Apache-2.0
Purpose: the browser's WebRTC connection to LiveKit
Existing Alternative: raw RTCPeerConnection
Why Existing Alternative Is Insufficient: LiveKit's signalling protocol, simulcast, adaptive stream and reconnect-with-refreshed-token are client-side behaviour; reimplementing them is the "media engine from scratch" ADR-074 rejects
Security Considerations: receives only the per-invitation token; holds no secret
Maintenance Considerations: pinned, bumped with the server image
Bundle / Runtime Impact: dynamic import on the room route only
Approval Required: yes — ADR-074

Dependency: @livekit/components-react (apps/web) — Apache-2.0 — hooks and primitives only; @livekit/components-styles is NOT added
Purpose: track subscription, tile and control state without hand-writing React bindings over livekit-client
Existing Alternative: hand-written hooks over livekit-client
Why Existing Alternative Is Insufficient: it would be a second, unmaintained copy of the same bindings; styling stays ours either way
Security Considerations: none beyond livekit-client
Maintenance Considerations: pinned; only hooks and unstyled primitives are imported, so an upstream restyle cannot reach this app
Bundle / Runtime Impact: room route only
Approval Required: yes — ADR-074
```

---

## Pillars touched

`CLAUDE.md` asks every non-trivial change to name which of its five pillars it
touches, and how.

| Pillar | How |
|---|---|
| Proper architecture | A core seam (mechanism) with `notify` as its only consumer (policy). Zero new `KNOWN_MODULE_COUPLINGS`, zero new domain events. The media server is its own deployed unit, not in-process code. |
| Scalable systems | A partial index for the per-minute reconciler. Cursor pagination on every new list. One LiveKit per node. A capacity cap that is measured, not assumed. |
| Secure by design | An invitation-only credential. `@SessionOnly()`. Evidence-class issuance audit. No admin or recording grant in any token. `auto_create: false`. Fail-closed webhook verification. Admission re-check and removal sweep. |
| Stable & reliable | Video never gates doc 24's workflow. Every provider call times out into a typed error. Idempotent writes keyed by unique columns. A reconciler that treats webhooks as best-effort. |
| Observable | `Logger` in every new service. Audit rows for grant, attach, end and removal. Attendance as a record. The provider status line. **Stated gap:** no metrics backend. LiveKit's Prometheus endpoint stays off until `DECISIONS.md` adopts one. |

---

## Scope lenses

### The shop-scale five

**The transaction, start to finish.** The job is "hold this meeting over
video". It runs:

1. call it with a room (§7.1);
2. the invite arrives with a link;
3. the invitee sees it under My meetings;
4. they join inside the window (§7.2);
5. the host ends it, or it closes itself (§7.3);
6. the host sees who attended.

**The other side of the same transaction.** The invitee joins. The host
attaches, ends, and reads attendance (§5.6). The operator sees provider status
and sets the three numbers (§11.4).

**What happens after "done".** The room ends for good (`videoEndedAt`).
Attendance stays as a record. Cancellation ends the room. Recording, the
natural after-life, is deferred with reasons (§10).

**The integrations a real business needs, not a demo.** A real SFU, real
TURN/TLS on 443, real signed webhooks and a real capacity measurement (§8). No
status enum stands in for a room.

**The policy layer that governs it.** The window, overrun and cap settings. The
invitation as the grant. Caller-only host actions.

### Group 1: the actor

**The actor with three tables.** No new actor table.

- A participant is a `User`, reached through `MeetingInvitation.userId`. Its
  LiveKit identity is the `MeetingInvitation.id`, and that is the linking
  column.
- The SFU is a machine principal with no table. Its identity is the key pair
  in `LIVEKIT_KEYS`.

**The principal with no permission key.** LiveKit, as webhook caller, is
authenticated by the `Authorization` JWT, signed with `LIVEKIT_API_SECRET` and
carrying `sha256(body)`, and checked by
`LiveKitVideoConferenceProvider.handleWebhook()`. It passes through no
`PermissionsGuard` and holds no catalogue key.

- It reads nothing.
- It writes only `MeetingVideoAttendance` records, and removals the API itself
  decides.
- `MeetingVideoReconcileCron` acts with no user. Its audit rows have
  `actorId: null` and are labelled system, as doc 24's escalation is.

**The grant that ends itself.** The join credential ends at most 120 s after
issue, and never after window close. It ends *sessions* at:

- window close (`endRoom`, reconciler);
- cancel (`cancel()` → `endVideo`);
- host end;
- deactivation (admission re-check plus the removal sweep; residual at most
  60 s, stated in §5.5).

`room.auto_create: false` makes each of those final. The deactivation
transaction in `UsersAdminService.update()` is not edited. It changes no row
this feature adds, because attendance is a record, not a grant.

### Group 2: the authority

**Whose rows, and which columns.**

- `GET …/my` returns only the caller's own invitations.
- The join route mints only the caller's own credential.
- `GET :id/video/attendance` is caller-only: invitees never see each other's
  join and leave times. Inside the room, everyone sees who is present, which
  is what a meeting is.
- The shortfall route's missing caller check (§1) is flagged, not copied.

**The threshold nobody approves alone.** Not applicable: this commits no money
or stock. The one magnitude, room size, is bounded twice without approval:

- `MeetingVideoMaxParticipants`, refused at attach, `settings.manage`;
- LiveKit's `limit.bytes_per_sec`, operator-only in the resource. A full node
  denies entry.

The cost is capped by the server, so no quorum is needed.

**The toxic pair, caught at grant or at act.** No new permission key, so no new
pair. The per-instance check is `actorId === meeting.calledByUserId` in
`attach()`, `endVideo(ENDED_BY_HOST)` and `attendance()`. It is the same
comparison `MeetingsService.cancel()` already makes.

**Authority and blast radius.** The three settings are changed by
`settings.manage` holders, a key already on `NON_DELEGATABLE_PERMISSIONS`. The
worst values:

- overrun 240: rooms stay joinable four hours past the end;
- join-opens 120;
- cap 200: bounded again by the server-side `bytes_per_sec`.

The audit row carries `{ from, to }`. The allowlist switch belongs to whoever
holds Coolify access. It is recorded in Coolify's deployment history, not
`AuditLog`, and that is stated rather than implied.

**Audience is a capability, not an address.** No new audience.

- `notify.meeting_video_added` and the invite link go to doc 24's materialised
  invitations. Those were resolved from a `notify.send` holder's audience,
  intersected with their reach, minus the host.
- **Zero holders:** a meeting whose audience resolved empty still has the
  host's own invitation.
- **Two hundred:** attach is refused above the cap, so no room exists to
  announce.

### Group 3: the act in the world

**Request or record: classify every write.**

- **REQUEST:** attach, join-token issuance, host end, settings change. Each is
  refusable, with the refusals listed in §5.2 and §7.1.
- **RECORD:** attendance from webhooks and the reconciler, and the
  reconciler's own `videoEndedAt`. A `participant_joined` is recorded even
  when admission then removes the person.
- The one sanctioned refusal of a record is an authenticity failure.

**The movement with no address.** Not applicable: this writes no stock or cash.
A meeting's physical place is doc 24's `Meeting.location`, unchanged.

**Four hours down, the counter stays open.** There are two outages to consider
(§9).

- **LiveKit down.** Meetings go ahead in person or by phone at `location`.
  RSVP works. Nothing on paper needs ingesting: attendance records presence
  *in the room*, and a meeting held elsewhere simply has none.
- **API down, LiveKit up.** Those in the room continue. On recovery, the
  reconciler backfills from `listParticipants()`. `providerParticipantId
  @unique` proves nothing is counted twice.

### Group 4: the money

**The unwritten posting rule.** Not applicable: no domain event carries money.
The SFU's host and bandwidth are a supplier bill, entered through the existing
`finance` expenses as any hosting bill is. A per-meeting cost figure would be
invented, not measured.

**Every column or none.** Not applicable: writes no `JournalLine`.

**The period that already moved.** Not applicable: no ledger fact. Attendance
is dated by the provider's event time and bound to no `FiscalPeriod`.

**The second legal entity.** Not applicable: no tax document and no number
series. A second `RetailBrand` is a second deployment (Br1) with its own LiveKit
resource and keys.

**Dry run before live.**

- `decideAttach()`/`previewAttach()` and `decideJoin()` are pure: no `prisma.`
  write, no `publish(`.
- `decideJoin()`'s second read-only caller is the My meetings list.
- `previewAttach()`'s caller is the create form's checkbox.

**Click the number.** The host's "*n* joined" counts distinct `invitationId`
over `MeetingVideoAttendance` for the meeting. It links to the paginated
attendance list, which sums back to it.

"Answered" (doc 24's shortfall, from RSVP) and "joined" (this document, from
presence) are **different facts** with different labels. Neither is
authoritative for the other. The legitimate deltas are:

- accepted but never joined;
- joined without answering;
- declined, then joined anyway;
- one invitation with several attendance rows after reconnects, which is why
  the figure counts distinct invitations.

### Group 5: the scale

**Three silhouettes, and the day the tier above appears.**

- **Solo:** the allowlist is empty and nothing renders. This is the expected
  state of most deployments.
- **Chain and Organization:** per node (§8.1). No tier-bearing column is
  needed: `notify` has no `organizationId` (ADR-040/044/060), and a meeting is
  node-local.
- **The day a tier appears above a Solo node,** the node's `NODE_ID` starts
  appearing in *new* room names. Existing `videoRoomName` values are stored
  and never recomputed, and rooms are ephemeral.

**The absent collaborator.**

- **Provider unconfigured:**
  - boot is unaffected;
  - no video UI renders;
  - attach returns 409 with its remedy;
  - the cron no-ops;
  - doc 24 is unchanged.
- **Provider configured but unreachable:** the feature degrades (503 with the
  meeting still standing). It never fails boot.
- **Configured without its variables:** boot fails loudly (§4.3).
- **`notify` absent from `MODULES`:** `core/video` has no controller and no
  cron of its own, and it is inert.

**The second copy of the write.**

- **A double-clicked Join** mints two tokens for one identity. LiveKit's
  duplicate-identity rule disconnects the older connection, so one invitation
  holds one seat.
- **Attach twice** is `updateMany where videoProviderKey: null` plus
  `videoRoomName @unique`.
- **A redelivered `participant_joined`** hits `providerParticipantId @unique`,
  and P2002 is swallowed.
- **A redelivered `participant_left`** is `updateMany where leftAt: null`.
- **Overlapping reconciler ticks** are covered by the idempotent `endRoom`, and
  by `videoEndedAt` being set by predicate.

**The hundred-thousandth row.**

- **Attendance** is the largest new table.
  - At Organization edition: 10,000 staff × 5 video meetings a week × about
    1.5 connections ≈ 75,000 rows a week, about 4M a year.
  - The host's list issues one indexed query per page on `[meetingId, leftAt]`.
- **My meetings** is one indexed query on `MeetingInvitation.[userId, …]` per
  page of 20.
- **The reconciler** reads only the partial index's rows. Each live room costs
  one `listParticipants` call plus one query on `[meetingId, leftAt]`.

**The adoption test.** This invents no human-readable number. Room names are
`mtg-` + (`NODE_ID-` off Standalone) + the meeting's cuid. They are generated
without a counter, so two offline nodes cannot collide.

### Group 6: the afterlife

**The reversal document, not the reversal flag.** Not applicable: no document
or amount is issued. The reverse of "attach" is "end" (`videoEndedAt` +
`videoEndedReason`), which is final and explained by its reason. The reverse of
the meeting itself is doc 24's cancellation notice, unchanged.

**The undo fan-out.**

- **Attach:**
  - the `Meeting` columns reverse automatically via `endVideo()`;
  - the host's invitation is deliberately kept, as the record that they were
    invited;
  - `notify.meeting_video_added` is deliberately irreversible, since delivered
    mail is not recalled; the page shows the room has ended.
- **Join:**
  - the token is automatic: it expires, and the session ends by `endRoom`;
  - the audit row is deliberately irreversible;
  - attendance rows are records, deliberately irreversible.
- **Cancel** gains `endRoom`, automatic in `cancel()` and retried by the
  reconciler.

**The version stamp.** Records written under the old settings stay
explainable after the settings change:

- the `join_issued` audit row stamps the `windowOpensAt`, `windowClosesAt` and
  `ttlSeconds` in force;
- `meeting.video.attached` stamps `capAtAttach` and `invitationCount`;
- `videoEndedReason` says why a room ended.

A join allowed at 09:47 is therefore explainable after the window settings
change.

**The erasure the ledger cannot obey.** Ruling 1 applies, table by table:

- **`MeetingVideoAttendance`:** no name and no `userId` column. It resolves the
  person through `invitationId`. Pseudonymised with `MeetingInvitation`, as doc
  24 already disposes of that row.
- **`AuditLog`** (`meeting.video.*`): `actorId` is `SetNull` on user delete.
  `data` holds ids and times only, **never a display name or token**, by
  construction in §5.3.
- **LiveKit:** the display name lives only in the room's memory for its
  lifetime. Container logs carry the invitation cuid and are rotated by the
  log driver (§8.10).
- **No `OutboxEvent` payload,** since no event is published.

**The failure path, and who is allowed to walk it.**

- **The durable store** is the `Meeting` row itself: `videoEndedAt IS NULL`
  past its window, inside the partial index. There is no second queue.
- **It is listed** in the host's My meetings row ("closing…") and in Logger
  `error` on every failed tick.
- **Permission:** the host (`notify.send` + caller).
- **Replay:** automatic every minute, and **End for everyone** runs the same
  path.
- **Why a replay is safe:** `not_found` → success, plus the predicate on
  `videoEndedAt`.

### Surface lenses that fire here

**Who read it, not just who wrote it.** Joining a meeting is reading a
conversation. Two rows make that visible, distinct from `AuditLog`'s
write-only actions:

- `meeting.video.join_issued` is the grant, evidence-class;
- `MeetingVideoAttendance` is the actual presence.

**Which tier owns the credential.** Each node's API env holds
`LIVEKIT_API_SECRET`, through Coolify. It is never in the database, the browser
or the repository. The LiveKit resource holds the same pair in `LIVEKIT_KEYS`.

**The switch, its scope, and who may throw it.** Three switches:

- `VIDEO_CONFERENCE_PROVIDERS`: deployment-scoped, thrown by the Coolify
  operator;
- per meeting, **End for everyone**: the host;
- the three settings: `settings.manage`.

There is no per-brand runtime switch, because one deployment is one brand.

**The retention clock with no dial.** Attendance rows are kept indefinitely,
like `MeetingInvitation`. No table here has a retention column. That is ruling
1's open prerequisite, named rather than solved.

**The stale clock nobody reads.** `MeetingVideoReconcileCron` compares:

- `endsAt + overrunMinutes` to `now`;
- open attendance rows to `listParticipants()`.

That is the code deciding "stale".

**The number that pages, and the number that doesn't.** No paging exists in
this repository. What does exist:

- the container healthcheck;
- the settings status line;
- Logger `error` on repeated `endRoom` failure.

That gap is stated, not papered over.

**The gate checked once, not per action.** Access is checked at each token
issuance and at each admission (`participant_joined`), and swept every minute.
It is never checked once at login.

**Quota has no owner.** Join is `@Throttle`d at 10 a minute. TURN has
`per_user_relay_allocation_limit`. The server has `bytes_per_sec`.

---

## Work orders

| WO | Title | Depends on |
|---|---|---|
| **205.1** | **Core seam.** `core/video/`: the interface, `VideoConferenceService` (allowlist, `isAvailable`, timeouts, typed error), `LiveKitVideoConferenceProvider`, `VideoModule` in `CoreModule`. The five env vars with the boot refusal, `SETUP_HINTS` and all three templates. `livekit-server-sdk`. Specs: allowlist selection; boot refusal; `not_found`→success on `endRoom`/`removeParticipant`; minted grants never contain `roomAdmin`/`roomCreate`/`roomList`/`roomRecord`/`hidden` and set `canUpdateOwnMetadata: false`; `exp − iat ≤ ttlSeconds`; `handleWebhook` returns `verified: false` for a missing header, a bad signature and a body altered by one byte. | — |
| **205.2** | **Schema.** The migration (four `Meeting` columns, `MeetingVideoAttendance`, two enums, the partial index). The three `SettingKey`s with defaults. | — |
| **205.3** | **Policy.** `MeetingVideoService`: `decideAttach`/`previewAttach`/`attach`, host invitation upsert, `decideJoin`/`issueJoin` with evidence audit, `endVideo`, `attendance`. `CreateMeetingDto.video`. `MeetingsService.cancel()` → `endVideo`. Routes `POST :id/video`, `GET :id/video/preview`, `POST :id/video/join` (`@SessionOnly`, `@Throttle`), `POST :id/video/end`, `GET :id/video/attendance`, `GET video/status`, `GET my`. The `SESSION_ONLY_ROUTES` entry. `notify.meeting_video_added`, plus the invite-body link. | 205.1, 205.2 |
| **205.4** | **Webhook intake.** `useBodyParser('raw', { type: 'application/webhook+json' })` in `main.ts`, with a spec proving exact bytes arrive. `POST webhooks/video/:providerKey`. Event → attendance writes. Admission re-check with removal. | 205.3 |
| **205.5** | **Reconciler.** `MeetingVideoReconcileCron`'s three passes, listed in `NotifyModule`. | 205.3 |
| **205.6** | **Web.** The create-form checkbox, `/admin/my-meetings` with nav entry and RSVP, `/admin/my-meetings/[id]/room`, the settings section with `GET`/`PUT /admin/settings/meeting-video`. `livekit-client` and `@livekit/components-react`, dynamically imported. Every state in §11. | 205.3 |
| **205.7** | **Deployment on NEWAX's own instance.** `docker-compose.video.yml`, `deploy/video/livekit.yaml`, the `docs/video.md` runbook. DNS, firewall, Traefik TCP router. Measured load test recorded, `limit.bytes_per_sec` set from it. Pinned image. Enable `VIDEO_CONFERENCE_PROVIDERS=livekit`. | 205.1–205.6 |

---

## Acceptance

1. **Off is byte-for-byte doc 24.** With `VIDEO_CONFERENCE_PROVIDERS` empty:
   - the API boots;
   - every existing `notify` spec passes unchanged;
   - `GET video/status` returns `available: false`;
   - attach returns 409 with its remedy;
   - the cron makes zero provider calls (spec);
   - no video control renders.
2. **Misconfiguration is loud.** `VIDEO_CONFERENCE_PROVIDERS=livekit` with any
   `LIVEKIT_*` missing refuses boot and names the variables
   (`env.validation.spec.ts`).
3. **Only an invitation gets a credential.**
   - A signed-in user with no `MeetingInvitation` row on the meeting gets 403
     from join, **including an `ADMIN` holding `notify.send`**.
   - An invitee gets 409 outside the window, on a cancelled meeting, and on an
     ended room.
   - An `nxa_` key belonging to an invitee is refused by
     `session-only-routes.spec.ts`.
4. **The token grants exactly what §5.4 says.** A decoded token shows:
   - `sub`/identity = the invitation id;
   - one room;
   - no admin, create, list, record or hidden grant;
   - `canUpdateOwnMetadata: false`;
   - a lifetime of at most 120 s and never past window close.
5. **No token without its audit row.** A spec forcing `recordEvidence` to throw
   gets an error response and no token.
6. **Webhooks are verified and idempotent.**
   - A tampered webhook body gets 401 and writes zero rows.
   - The same `participant_joined` delivered twice yields one attendance row.
   - `participant_joined` for an inactive user's invitation calls
     `removeParticipant` and writes `meeting.video.participant_removed`.
7. **The reconciler converges.**
   - A room past `endsAt + overrun` is ended once, and `videoEndedAt` is set
     once, across two overlapping ticks.
   - A participant present in `listParticipants()` with no row gets one.
8. **LiveKit failure never breaks doc 24.** With the provider stubbed to time
   out, join returns 503 with the "meeting stands" message. Create, respond,
   shortfall and cancel all behave identically to the provider-absent case
   (spec).
9. **`auto_create: false` holds on the real deployment.** A token minted for a
   room, used after `endRoom()`, fails to connect. Recorded in `docs/video.md`
   with the date.
10. **Real-network reach.** A real browser with outbound UDP blocked connects
    through TURN/TLS on 443, and media flows. Recorded.
11. **Capacity is measured, not guessed.** The load test at the default cap is
    measured and recorded before the allowlist is set on any deployment.
    `limit.bytes_per_sec` is derived from it.
12. **Architecture holds.**
    - `grep -rn "implements VideoConferenceProvider" apps/api/src` returns one
      class.
    - `KNOWN_MODULE_COUPLINGS` is unchanged.
    - No new `DomainEvent`.
    - A spec asserts that no `Logger` call and no `AuditLog.data` contains the
      token string.
13. **Reachable.** An invitee who holds no `notify.*` key reaches Join by
    clicking Organization → My meetings.
14. **Green.** `pnpm lint && pnpm typecheck && pnpm test` pass, with both apps
    still at 0 errors and 0 warnings.

---

## Out of scope

Each item below is named deliberately rather than stubbed:

- **Recording, and everything that hangs on it:** Egress, storage streaming,
  consent, retention, playback permission. §10 gives the reasons and the ADR
  the later phase opens with.
- **Transcription and captions.**
- **Virtual backgrounds and noise suppression** beyond what LiveKit's client
  gives for free.
- **Breakout rooms, webinars, waiting rooms, and host mute or kick of one
  participant.** "End for everyone" is the one host control.
- **Guest or external participants, shareable links and PINs.** They would be
  a second identity system.
- **Uninviting one person.** Doc 24 has no invitation revocation, and one is
  owed by doc 24 before a room could honour it.
- **Native mobile apps.** Browser WebRTC through `livekit-client` covers
  desktop and mobile browsers in v1.
- **Multi-region, or multi-node LiveKit:** Redis-backed distribution, a
  separate TURN fleet.
- **A LiveKit shared across deployments.** §8.1 explains that it leaks between
  tenants through the global webhook list.
- **Any product, plan, module toggle, marketplace listing, pricing or metering
  that sells video to tenants.** Explicitly declined by the owner. Turning it
  on for a client deployment is an operator decision this document does not
  take.
- **A `UserDeactivated` domain event from `users`.** It would tighten §5.5's
  60-second residual. It is a separate decision about a core module's event
  surface.
- **The three doc-24 gaps in §1:** the shortfall route's missing caller check,
  the unreachable quorum settings, and the retention citation. They are named
  for doc 24's own follow-up.
- **A metrics backend for LiveKit's Prometheus endpoint.** That is a
  `DECISIONS.md` decision.
- **Calendar (ICS) integration.** Doc 24 already names only the seam.
