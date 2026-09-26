# 139 — A second real front door: proving the port model with a WebSocket/SSE gateway, for agent and voice sessions specifically

> **Status: verified, 2026-09-26.** This document's own factual premises
> hold today: `IntentRouterService` (`core/intent/intent-router.service.ts`)
> exists exactly as doc 135 and this document both assume — a
> `register()`/`route()`/`list()` API that reuses `decideApiKeyAccess` for
> its permission checks, so it can never drift from `PermissionsGuard`'s own
> HTTP-path enforcement. No WebSocket or SSE dependency
> (`@nestjs/websockets`, `@nestjs/platform-ws`, `socket.io`, `ws`) appears
> in `apps/api/package.json`, and no gateway file exists anywhere in
> `apps/api/src` — confirming this document's own premise ("not yet built")
> remains true. WO-139.1 is left unbuilt on purpose: it is this document's
> own named future work, explicitly scoped only for "once a real agent/voice
> integration requirement exists," and no such requirement exists in this
> codebase today. Building `AgentSessionGateway` now, with no real caller to
> connect to it, would be exactly the speculative functionality CLAUDE.md's
> "No speculative functionality" section forbids — the same reasoning
> already applied to doc 128's deferred `ShippingCarrier.getRate()`. See
> `DECISIONS.md` ADR-053.

Doc 135's `IntentRouter` proves the *logical* seam for a new interaction
paradigm; this document is the one concrete *transport* addition worth
building alongside it — a persistent, bidirectional channel (WebSocket or
SSE) sharing the identical `PermissionsGuard`/service layer HTTP already
uses, for the specific class of caller that genuinely needs one: a
long-running agent session or a voice/video interaction that cannot wait
for a request-response round trip per turn.

## 1. A second transport, the identical authorization and service layer

```ts
// A WebSocket gateway, authenticated identically to an HTTP request
// (the same JWT or ApiClient key, verified once at connection time and
// re-checked per message per PermissionsGuard's own existing rule) —
// never a second, separately-designed authorization model:
@WebSocketGateway()
export class AgentSessionGateway {
  @SubscribeMessage('intent')
  async handleIntent(client: AuthenticatedSocket, payload: Intent): Promise<unknown> {
    // Identical to doc 135's own IntentRouter.route() — the WebSocket
    // gateway is one more Intent SOURCE, never a parallel business-logic
    // path.
    return this.intentRouter.route({ ...payload, actorContext: client.actorContext });
  }
}
```

This is deliberately **not** a general real-time API for every existing
HTTP endpoint — doc 58's own polling-based "live feed" already covers the
ordinary dashboard-glance case honestly, without claiming push
infrastructure this repository didn't have. This gateway exists
specifically for the identified new caller class doc 135 named: a
session-oriented, multi-turn interaction (an agent conversation, a voice
session) where a persistent connection genuinely earns its keep, not a
wholesale replacement of the REST API doc 98/99 already specifies as this
repository's own primary, versioned interface.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — identical to whatever authenticated the
WebSocket connection (a `User` session or an `ApiClient`) — no new actor
kind, no new authentication mechanism.
**Whose rows, and which columns** — identical to what the resolved
`Intent`'s own underlying service call already enforces, per doc 135's
own answer, unchanged here.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a beyond the underlying service's own existing answer;
this document adds only a transport, no new authorization decision.
**Audience is a capability, not an address** — n/a: a bidirectional
session, not a broadcast notification.
**Request or record** — each message is a REQUEST exactly like its
HTTP-equivalent; classification of any resulting write is unchanged from
whatever the underlying service call already answers.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity / Dry run before live** — n/a beyond what the underlying service
call already answers.
**Three silhouettes** — Solo/Chain: unlikely to be used. Organization,
and specifically wherever a real agent or voice integration is deployed:
the one case this gateway exists for.
**The absent collaborator** — with no client ever connecting via
WebSocket, this repository behaves exactly as today; the gateway is
purely additive.
**The second copy of the write** — n/a beyond whatever idempotency the
underlying service call already provides.
**The hundred-thousandth row** — n/a: no new table; connection count is
bounded by real concurrent agent/voice sessions, monitored like any other
resource.
**The reversal document / The undo fan-out / The version stamp** — n/a
beyond the underlying action's own existing answers.
**The erasure the ledger cannot obey** — a session's own transcript, if
retained for debugging, follows its own named retention basis, never
assumed exempt — the identical discipline doc 135's own voice-transcript
answer already states.
**The failure path** — a dropped connection mid-session requires the
client to reconnect and resume; no message is assumed delivered without
an explicit acknowledgment, the same at-least-once discipline doc 100's
own outbox pattern already establishes, applied here to a live
connection instead of a queued event.

## Work orders

**WO-139.1 (named future work, scoped now, built once a real agent/voice
integration requirement exists)** — the `AgentSessionGateway` above,
authenticated identically to the existing HTTP API, routing every message
through doc 135's own `IntentRouter`, never a parallel business-logic
path.

## Acceptance

- A WebSocket-sourced intent produces byte-identical results to the same
  intent sourced via HTTP, proven by a spec (mirroring doc 135's own
  acceptance criterion).
- No existing HTTP endpoint is duplicated or bypassed by this gateway;
  every capability it exposes is already reachable via the REST API.

## Out of scope

Migrating any existing dashboard interaction to WebSocket — doc 58's own
honest polling-based answer stands unchanged for ordinary dashboard
use; this gateway is scoped specifically to session-oriented agent/voice
callers, never a general real-time upgrade of the existing REST surface.
