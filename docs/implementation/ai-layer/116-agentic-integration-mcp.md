# 116 — MCP: a fourth adapter kind over services that already exist, not a new capability surface

"Transition from static API endpoints to semantic, tool-based operations
where AI agents can discover and execute domain-specific business logic
dynamically. Implement the Model Context Protocol (MCP)... Utilize
Server-Sent Events (SSE) for low-latency, two-way data streaming... Keep
your MCP servers stateless and replaceable" describes a real, current
integration pattern (MCP is a real, standardized protocol for exposing
tools to an AI agent) applied to a genuine architectural question this
repository can answer cleanly, precisely because of doc 115's own finding:
**every service method in this repository is already trigger-agnostic.**
Exposing a service as an MCP tool is a new *adapter*, not a new
capability — the identical shape as doc 36's `OutboundConnector` being a
new adapter over an existing domain event, applied here to an *inbound*
tool call instead of an outbound webhook.

## 1. An MCP tool adapter, calling the identical service an HTTP controller already calls

```ts
// A new adapter kind, alongside the existing HTTP controller — never a
// parallel reimplementation of business logic:
interface McpToolDefinition {
  name: string;                    // "check_inventory", "create_order"
  description: string;             // what an agent reads to decide whether to call this
  inputSchema: JsonSchema;
  requiredPermission: string;      // the identical PermissionsGuard key an HTTP route for the same action would require
  handler: (input: unknown, actorContext: ActorContext) => Promise<unknown>;
}

// Example: the identical InventoryService method an HTTP endpoint already calls
const checkInventoryTool: McpToolDefinition = {
  name: 'check_inventory',
  description: 'Check current stock for a product variant at a location.',
  inputSchema: { variantId: 'string', locationId: 'string' },
  requiredPermission: 'inventory.view',
  handler: (input, actor) => inventoryService.currentStock(input.variantId, input.locationId, actor),
};
```

`PermissionsGuard`'s own enforcement is not bypassed for an agent caller —
`requiredPermission` is checked identically to an HTTP route, per this
bullet's own fourth point ("enforce granular authorization models...
fine-grained scopes... when autonomous systems act on behalf of human
users," echoed again in doc 118 below). An AI agent authenticates as a
real principal (a scoped `ApiClient`, doc 34's own existing inbound-
authentication model) and is checked against the exact same
`PERMISSION_CATALOG` a human user would be.

## 2. SSE for long-running tasks — the existing outbox pattern, exposed as a stream, not a new delivery mechanism

"Low-latency, two-way data streaming... for long-running tasks like data
embedding or generative output without relying on rigid polling" already
has a same-database answer: an MCP tool call that kicks off a long-running
task returns immediately with a job reference, and the *result* is
delivered via SSE by subscribing to the identical
`OutboxEvent`/domain-event stream this repository already publishes to
internally (doc 100) — never a second, parallel job-queue mechanism.
Doc 09's own `AiProvider` embedding calls are the concrete example: an
embedding job publishes a completion event exactly as any other
long-running domain operation already does; an SSE endpoint is a thin
adapter subscribing to that same event stream for one caller's own job,
not a new subsystem.

## 3. "Stateless and replaceable... isolating the LLM runtime... on the client side"

This is already this repository's own default posture: `AiProvider` (doc
09) is this repository *calling out* to an LLM, never running one
in-process; an MCP tool server built from the adapter pattern above holds
no LLM state itself — it is a thin, stateless translation layer over
already-stateless HTTP-shaped service calls, exactly matching the bullet's
own "provider of tools and data" framing. No new statefulness is
introduced by adding this adapter kind.

## Scope lenses

**The actor with three tables** — an MCP-calling AI agent authenticates as
a scoped principal (doc 34's `ApiClient`, key-hash, never a `User` row) —
the identical actor-modeling question doc 34 already answers for any
third-party API caller.
**The principal with no permission key** — n/a: an MCP tool caller
authenticates via `ApiClient`'s own existing key-hash mechanism and is
checked against `PERMISSION_CATALOG` identically to any other caller.
**The grant that ends itself** — an `ApiClient`'s own existing
revocation/expiry mechanism (doc 34) applies unchanged; an MCP tool
adapter adds no new grant lifecycle.
**Whose rows, and which columns** — identical to whatever the underlying
service already enforces — an MCP tool never widens what its calling
`ApiClient` can see beyond what the same client could already reach via
the equivalent HTTP endpoint.
**The threshold nobody approves alone** — a tool that can commit money or
stock (e.g., `create_order`) requires the identical permission and
approval-chain gating (doc 63) an HTTP-triggered equivalent action
already requires — an agent never gets a shortcut around a human
approval step a UI-driven action would also need.
**The toxic pair** — n/a beyond whatever toxic-pair rule the underlying
permission already encodes; an MCP adapter introduces no new permission
combination.
**Authority and blast radius** — which tools are exposed to which
`ApiClient` scopes is itself an admin-configured allowlist
(`platform.mcp.manage`-shaped), audited like any other client-scope
change.
**Audience is a capability, not an address** — n/a: a tool call is a
synchronous (or job-then-SSE) request-response, not a notification.
**Request or record** — an MCP tool call is a REQUEST exactly like its
HTTP-endpoint equivalent (can be refused by validation or permission
check); the resulting write, if any, is classified identically to what
the same action classifies as when triggered by a human — this document
introduces no new classification.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a beyond what the underlying service call already answers
for its own domain (an MCP-triggered stock movement still names its
`locationId` exactly as an HTTP-triggered one must).
**Dry run before live** — a tool's own `handler` is exactly as pure or
impure as the underlying service method it calls; no new dry-run concept
beyond what that method's own originating document already answers.
**Three silhouettes** — Solo: unlikely to be used at all. Chain/
Organization: a real integration surface for an operator's own internal
automation or a client's chosen AI assistant, gated to exactly the tools
and scopes an admin explicitly allowlists.
**The absent collaborator** — with no MCP adapter registered, this
repository behaves identically to today — an entirely additive surface.
**The second copy of the write** — n/a beyond whatever idempotency the
underlying service call already provides; an MCP tool call retried by an
agent is subject to the identical uniqueness constraints an HTTP retry
would be.
**The hundred-thousandth row** — n/a: this is a calling convention, not a
new table.
**The reversal document / The undo fan-out / The version stamp** — n/a
beyond the underlying action's own existing answers.
**The erasure the ledger cannot obey** — an MCP tool call's own audit
trail (who — which `ApiClient` — called what, when) goes through
`AuditService` exactly as any other API-triggered action already does.
**The failure path** — a tool call that fails (bad input, permission
denied, underlying service error) returns a structured MCP error, never
a silent no-op an agent could misinterpret as success.

## Work orders

**WO-116.1 (named future work, not built here)** — an `McpToolAdapter`
registry exposing a curated, explicitly allowlisted subset of existing
services as MCP tools, reusing `PermissionsGuard` and doc 34's `ApiClient`
authentication unchanged. Not built speculatively; scoped for
implementation once a real AI-agent integration requirement names which
specific tools it needs.

## Acceptance

- No schema or service change from this document alone.
- Any future MCP tool exposes no capability beyond what the identical
  action already permits via the existing HTTP API for the same
  `ApiClient` scope.

## Out of scope

Building a general MCP server exposing every service method as a tool
speculatively — per `CLAUDE.md`'s own "No speculative functionality," a
curated, explicitly-permissioned allowlist is scoped once a real
AI-agent integration requirement names its actual needed tools, never
built as a blanket capability ahead of one.
