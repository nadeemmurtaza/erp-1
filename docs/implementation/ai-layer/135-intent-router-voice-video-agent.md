# 135 — An intent router: the direct answer to "what if there's no dashboard tomorrow"

This is the document that most directly answers the scenario you
described — voice input, video-call-style interaction, an interaction
paradigm nobody has built yet. Doc 116 already scoped an MCP tool adapter
for AI agents specifically; this document generalizes that one step
further, to **any** future modality, by naming the actual seam that makes
a modality change cheap: an intent, not a UI event, is what a service
call should be triggered by.

## 1. An `Intent` is the one shape every future modality converges on

```ts
// Whether the source is a dashboard button click, a voice transcript run
// through an NLU model, a video-call assistant's own structured output,
// or an MCP tool call — every one of them, by the time it reaches this
// repository's own business logic, is reducible to the SAME shape:
interface Intent {
  name: string;                      // "check_inventory", "approve_leave_request"
  parameters: Record<string, unknown>;
  actorContext: { userId?: string; apiClientId?: string };
  sourceModality: string;            // "dashboard" | "voice" | "video" | "mcp_agent" | a future one
}

interface IntentRouter {
  /** Resolves an Intent to the identical service call an HTTP controller
   *  for the same action already makes — doc 115's own trigger-agnostic
   *  service layer is EXACTLY what makes this possible with zero change
   *  to any existing service method. */
  route(intent: Intent): Promise<unknown>;
}
```

**This is doc 116's own `McpToolDefinition` registry, generalized**: an
MCP tool call is one specific `sourceModality` this router already
handles; a voice-transcript-derived intent or a video-call assistant's
own structured output are two more, added as new *parsers that produce an
`Intent`*, never as new business logic. The router itself does the same
lookup regardless of source: resolve `intent.name` to a registered
handler, check `intent.actorContext` against `PermissionsGuard` exactly
as an HTTP request would be, call the identical service method.

## 2. What changes when tomorrow's paradigm arrives, and what does not

| When voice/video/a new paradigm shows up | What's built | What's untouched |
|---|---|---|
| A voice-transcription pipeline | One new adapter: `VoiceIntentParser`, converting a transcript into an `Intent` | Every `*Service` method, every permission, every domain event |
| A video-call assistant | One new adapter: `VideoIntentParser` | Same |
| No dashboard at all | The `IntentRouter` becomes the *primary* front door instead of HTTP controllers being the only one; controllers themselves become just one more `Intent`-producing adapter | Same |

This is the concrete mechanism behind the answer given in the earlier
part of this conversation: a new interaction paradigm costs exactly one
new adapter, because the router — not the UI — is where "does this
caller have permission, which service method does this map to" is
decided, and that decision logic is identical regardless of who's asking.

## Scope lenses

**The actor with three tables** — `actorContext` resolves to doc 20's
`User` or doc 34's `ApiClient` — no new actor kind; a voice/video session
still authenticates as one of these two existing shapes.
**The principal with no permission key** — n/a: every intent source
authenticates via an existing mechanism (a user session, an `ApiClient`
key) before producing an `Intent`; the router itself trusts nothing it
wasn't handed already-authenticated.
**The grant that ends itself** — n/a beyond whatever the underlying
session/`ApiClient` already answers.
**Whose rows, and which columns** — identical to whatever the resolved
service call already enforces; the router adds no new visibility rule of
its own, exactly doc 116's own answer for MCP tools, generalized.
**The threshold nobody approves alone** — an intent that would commit
money or stock passes through the identical approval-chain/permission
gate an HTTP-triggered equivalent already requires — a voice command
never gets a shortcut around a human approval step a dashboard click
would also need.
**The toxic pair / Authority and blast radius** — n/a beyond the
underlying service's own existing answer.
**Audience is a capability, not an address** — n/a: an intent is a
request-response, not a notification.
**Request or record** — an intent call is a REQUEST exactly like its
HTTP-equivalent (refusable by validation/permission); its resulting
write, if any, is classified identically to what the same action
classifies as when triggered by a dashboard — no new classification.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity / Dry run before live** — n/a beyond what the underlying service
call already answers for its own domain.
**Three silhouettes** — Solo: unlikely to need anything beyond today's
dashboard. Chain/Organization: where a genuinely different interaction
paradigm (a warehouse worker's hands-free voice interface, a call-center
video assistant) becomes a real, named requirement — the router is ready
the day that requirement is real, without a rewrite.
**The absent collaborator** — with no non-HTTP intent parser registered,
this repository behaves exactly as it does today — the router is an
additive layer, not a replacement for existing controllers.
**The second copy of the write** — n/a beyond whatever idempotency the
underlying service call already provides — an intent retried by a flaky
voice pipeline is subject to the identical uniqueness constraints an
HTTP retry would be.
**The hundred-thousandth row / The reversal document / The undo fan-out /
The version stamp** — n/a: this is a calling convention, not a new table.
**The erasure the ledger cannot obey** — n/a beyond the underlying
action's own existing answer; a voice transcript itself, if retained for
debugging, follows its own named retention basis, never assumed exempt.
**The failure path** — an intent that fails to resolve to any registered
handler returns a structured "I don't know how to do that" response,
never a silent no-op a voice/video caller could misinterpret as success.

## Work orders

**WO-135.1 — `Intent`/`IntentRouter`**, generalizing doc 116's own
`McpToolDefinition` registry to accept intents from any source, not only
MCP.
**WO-135.2 — retrofit doc 116's own MCP tool adapter to be one
`IntentRouter` source among others**, rather than a separate mechanism.
**WO-135.3 (named future work, not built here)** — a specific
voice-transcript or video-assistant parser, built once a real requirement
names the actual product and interaction shape needed.

## Acceptance

- `IntentRouter.route()` for an MCP-sourced intent produces byte-identical
  results to calling the same service method via HTTP with equivalent
  parameters — proven by a spec.
- Adding a hypothetical new intent source requires zero changes to any
  existing `*Service` method — proven by the router's own design, which
  never imports a modality-specific type into a service.

## Out of scope

Building any specific voice or video parser today — no real product
requirement names one yet; this document builds only the router the
future parser would plug into, per this repository's own "no speculative
functionality" discipline applied to the parser itself, while still
building the seam that makes adding one cheap later.
