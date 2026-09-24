# 130 — A capability manifest: what this system can do, discoverable, not just documented

Every extension point this repository has (`PaymentProvider`,
`NotificationChannel`, `FiscalComplianceProvider`, and this same batch's
own `IdentityProvider`/`ShippingCarrier`, doc 128) is documented in
`docs/index/` for a *human* reader. Nothing today lets a *program* — a new
integration partner's own onboarding script, or doc 116's own future MCP
tool adapter — ask "what can this deployment actually do right now"
without reading source code. This document is that machine-readable
answer: a live, generated manifest of what is actually registered and
enabled in a running deployment, distinct from `docs/index/`'s own
static, build-time documentation.

## 1. The manifest, generated from live registrations, never hand-maintained

```ts
interface CapabilityManifest {
  organizationId: string;
  enabledModules: string[];              // the live MODULES allowlist for this deployment
  registeredProviders: {
    payment: string[];                   // ["easypaisa", "jazzcash"]
    notification: string[];              // ["email", "sms", "whatsapp"]
    fiscalCompliance: string[];          // ["fbr"]
    identity: string[];                  // doc 128's own new port
    shippingCarrier: string[];           // doc 128's own new port
    vectorStore: string[];
  };
  permissionCatalog: Array<{ key: string; description: string }>;
  mcpTools: Array<{ name: string; description: string; requiredPermission: string }>; // doc 116, once built
}

async getCapabilityManifest(organizationId: string): Promise<CapabilityManifest> {
  // Reads the LIVE registry state (which provider classes are actually
  // instantiated for this deployment) — never a static document that can
  // drift from what's actually running, the same "generated from the
  // code, never hand-maintained" discipline docs/index/ already follows.
}
```

## 2. Who reads this, and why it matters for the future you're actually worried about

A future integration partner (a client's own developer, an AI agent
via doc 116's own tool adapter, a hyperautomation platform via doc 36's
`OutboundConnector`) can call this endpoint once and know exactly which
domain events exist to subscribe to, which payment methods are live,
which permissions gate which action — **without** reading this
repository's source code or asking a human. This is the concrete,
buildable answer to "new innovation, third-party integration" from the
flexibility framing: the system describing its own current shape,
continuously, rather than that shape being knowable only from static
documentation that can go stale.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read-only introspection endpoint,
not an actor.
**Whose rows, and which columns** — the manifest reveals *capability
shape* (which providers exist), never secret material (a provider's own
credentials are never included) — gated by `settings.capabilities.view`,
broader than most admin permissions since it's inherently low-risk
metadata, but still not public/unauthenticated.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read, no write, no authority to bound.
**Audience is a capability, not an address** — n/a: a pull endpoint, not
a push notification.
**Request or record / The movement with no address / The unwritten
posting rule / Every column or none / The period that already moved /
The second legal entity / Dry run before live** — n/a: a pure read over
already-live registry state, no money/stock fact, no computed rule.
**Three silhouettes** — Solo: rarely queried. Chain/Organization: the
real use case — a client's own integration team or an onboarding
automation script querying this once at setup time.
**The absent collaborator** — a module or provider that is off/
unregistered simply does not appear in the manifest's own arrays — never
an error, never a stale entry.
**The second copy of the write / The hundred-thousandth row / The
reversal document / The undo fan-out / The version stamp** — n/a: no
write, small response payload, always current by construction (read from
live state, never cached beyond a short TTL if performance later demands
it).
**The erasure the ledger cannot obey** — n/a: no personal data in a
capability description.
**The failure path** — n/a beyond an ordinary query failure.

## Work orders

**WO-130.1 — `getCapabilityManifest(organizationId)`**, reading live
registry state across every extension-point registry this repository
already has (payment, notification, fiscal, and doc 128's own new ports).
**WO-130.2 — `GET /admin/capabilities` endpoint**, gated by
`settings.capabilities.view`.
**WO-130.3 — extend the manifest as doc 116's MCP tool adapter ships**,
including registered tools and their required permissions.

## Acceptance

- The manifest never lists a provider or module that is not actually
  live in the current deployment, proven by a spec comparing the
  manifest's own output against the actual registry state.
- No secret or credential value ever appears in the manifest response.

## Out of scope

A public, unauthenticated capability-discovery endpoint — this manifest
is gated behind authentication and a real permission; a fully public
version (for, say, marketplace-style third-party app discovery) is a
distinct, separately-scoped capability if that specific need is ever
named.
