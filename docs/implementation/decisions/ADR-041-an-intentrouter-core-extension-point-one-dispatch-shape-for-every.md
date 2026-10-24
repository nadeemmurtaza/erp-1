# ADR-041 — An `IntentRouter` core extension point: one dispatch shape for every future calling modality, proven against one real service call

[← Decision log](../DECISIONS.md)


### Context
Doc 135 (`ai-layer/135-intent-router-voice-video-agent.md`) asks the direct
question "what if there's no dashboard tomorrow" — a voice transcript, a
video-call assistant, or an MCP tool call all need the identical answer to
"does this caller have permission, which service method does this map to,"
and doc 116's own `McpToolDefinition` registry (`ai-layer/116-agentic-
integration-mcp.md`) already named that shape for one modality. Doc 116's
own MCP adapter (WO-116.1) and doc 135's own voice/video parsers (WO-135.3)
are each explicitly named as future work, not built here — a live MCP
transport server and a voice/video pipeline are real infrastructure with no
real requirement naming them yet, per `CLAUDE.md`'s own "no speculative
functionality." What this ADR decides is narrower: whether the dispatch
*seam* itself — `Intent`/`IntentRouter` — is worth building now, ahead of
either concrete caller, the same way `AiProvider`, `StorageDriver` and
`PaymentProvider` were each built as a registered extension point before
every implementation or caller existed.

### Options Considered
1. **Build nothing until a real MCP or voice/video requirement exists.**
   Defers doc 135 entirely alongside doc 116's own adapter and doc 135's own
   parsers.
2. **Build `Intent`/`IntentRouter` now, as core-only infrastructure**,
   proven against one real, already-existing service call (the same
   `getChainStatus()` doc 116 itself used as its own worked example), with
   no live external caller (no MCP transport, no voice/video parser) —
   exactly WO-135.1 as doc 135 names it, deferring WO-135.2 (retrofitting a
   still-unbuilt MCP adapter) and WO-135.3 (a still-unnamed voice/video
   parser).
3. **Build the router AND a live MCP tool server** — pulled WO-116.1
   forward, ahead of doc 116's own explicit deferral.

### Decision
**2.** `IntentRouterService` (`core/intent/`) is a `@Global()` core module —
a plain registry (`register()`/`route()`/`list()`) any feature module
injects and registers its own intents into from its own `onModuleInit()`,
the identical pattern `StockIntakeRegistry` already established for two
core modules decoupling from each other. `InventoryService` registers
exactly one intent, `check_inventory_chain_status`, wrapping its own
existing `getChainStatus()` unchanged — the same method `GET /admin/
inventory/:variantId/chain` already calls. Permission enforcement reuses
`decideApiKeyAccess()` (`core/auth/api-keys/api-key-access.ts`) directly
rather than re-deriving it, so an intent is refused to a caller under the
identical rule an HTTP route would refuse them, by construction, not by
two independently-maintained implementations agreeing today.

### Reasoning
- **One real registration, not zero and not many.** An empty router with no
  registered intent would be exactly the "unused abstraction" `CLAUDE.md`
  asks "what real boundary justifies its existence?" about — nothing would
  ever call `route()` outside a test. A blanket registration of every
  service method would be the "general MCP server exposing every method
  speculatively" doc 116 itself names and refuses. One curated,
  already-permissioned, read-only method — the same one doc 116's own
  worked example named — is the minimum that makes doc 135's acceptance
  criterion ("byte-identical results to calling the same service method via
  HTTP") a fact a spec proves today, not a claim about code that doesn't
  exist yet.
- **Reusing `decideApiKeyAccess` instead of a parallel permission check**
  is the same reasoning ADR-037 already established for keys: two
  independently-written authorization checks drift the day one of them is
  edited and the other is not; one function called from two call sites
  cannot drift from itself.
- **No new actor kind.** Doc 135's own sketch imagined `actorContext:
  {userId?, apiClientId?}` against doc 34's still-deferred `ApiClient`
  (ADR-037's own decision 1(a)). `Intent.actor` uses the real
  `AuthenticatedUser` shape instead — a session or a personal API key
  (163-personal-api-keys.md) — since that is what this codebase actually
  authenticates callers as today; inventing a second actor shape for a
  router with no live caller would be exactly the kind of gap a future
  ApiClient decision would have to reconcile against two things instead of
  one.

### Consequences
- **WO-135.2 (retrofit doc 116's MCP adapter as one `IntentRouter` source)
  stays blocked**, honestly, on WO-116.1 not existing — this ADR does not
  pretend to satisfy it. The router's own design (accepting any
  `sourceModality` string, trusting nothing it wasn't handed already-
  authenticated) is what makes that retrofit a new adapter file when it
  happens, not a router redesign.
- **Adding a second registered intent is free** — any module injects
  `IntentRouterService` and registers from its own `onModuleInit()`, with
  zero change to `IntentRouterService` itself or to any existing
  `*Service` method, which is doc 135's own second acceptance criterion,
  now provable rather than asserted.
- **The router has no HTTP route or admin screen of its own** — like
  `AiProvider`/`StorageDriver`, nothing a human directly clicks depends on
  it yet, so `CLAUDE.md`'s "reachable" rule does not apply until a real
  caller (an MCP adapter, a voice parser) gives it one.

### Status
**Accepted.** WO-135.2 and WO-135.3: **deferred**, exactly as doc 135 and
doc 116 each already name — reopen either the day a real MCP integration or
voice/video requirement is named.
