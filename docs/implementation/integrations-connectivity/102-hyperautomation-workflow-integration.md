# 102 — n8n-style automation: doc 36's `OutboundConnector` already is this, by its own example

"Expose governed endpoints that easily ingest payload data into visual
platforms like n8n. This automates multi-step processes across
independent applications without hardcoding every third-party
connection" is, almost word for word, doc 36's own stated purpose for its
`OutboundConnector` model (`36-universal-connectivity-integration-
framework.md`) — whose own schema comment gives `"Zapier webhook"` as a
worked example `label` value. n8n and Zapier are the identical class of
tool (a visual, webhook-driven workflow-automation platform); doc 36's
own design is deliberately platform-agnostic, since both integrate the
same way — a governed outbound HTTP call, triggered by a domain event,
shaped by a template.

## What doc 36 already specifies, restated rather than re-derived

```prisma
// doc 36's own schema — connectors.prisma
model OutboundConnector {
  label            String  // "Client's own SAP instance", "Zapier webhook" — an n8n webhook URL fits identically
  targetUrl        String
  authMethod       ConnectorAuthMethod  // NONE | API_KEY_HEADER | BASIC | OAUTH2_CLIENT_CREDENTIALS
  subscribedEvents String[]              // a subset of the existing DomainEvent catalogue — never a new event system
  payloadTemplate  String                // maps the canonical event payload onto whatever shape n8n's webhook trigger expects
  status           ConnectorStatus
  deliveries       ConnectorDelivery[]   // the SAME table shape as the existing OutboxEvent/OutboxDispatcher, generalized to an external HTTP target
}
```

"Governed endpoints" is doc 36's own `credentialsEncrypted` +
`ConnectorStatus = SUSPENDED` kill-switch + the existing
`platform.flags.manage`-style permission gating (doc 36's own scope
lenses already name the exact permission this connector's management
screen requires). "Without hardcoding every third-party connection" is
doc 36's own explicit reasoning for existing at all: "write a typed
interface once a real, repeated need exists; use the generic connector
for everything else... `we need to push order data to whatever system
this client already runs` never blocks on writing a new typed interface
first."

## Scope lenses

Not repeated — doc 36's own scope lenses already answer every lens for
this exact mechanism (delivery retry sharing `OutboxDispatcher`'s own
backoff policy, credential encryption, suspend-as-kill-switch, OAuth2
token caching).

## Work orders

None new. Doc 36's own work orders (schema, dispatcher extension, OAuth2
token provider, admin UI for connector management) are the actual build;
this document exists only to connect n8n's own name to doc 36's already-
complete brief, confirming no n8n-specific adapter is needed — n8n
consumes an ordinary webhook exactly like any other target doc 36's
generic connector already serves.

## Acceptance

- No new schema beyond doc 36's own `OutboundConnector`/`ConnectorDelivery`.
- A connector pointed at an n8n webhook URL requires no n8n-specific code
  — proven by doc 36's own design being genuinely target-agnostic.

## Out of scope

A bespoke n8n integration (an n8n-specific SDK, a published n8n community
node) — doc 36's own generic, template-driven connector already serves
n8n identically to Zapier or any other webhook-consuming platform; a
dedicated n8n node is a distinct, optional convenience only worth building
if n8n usage becomes common enough among real clients to justify it.
