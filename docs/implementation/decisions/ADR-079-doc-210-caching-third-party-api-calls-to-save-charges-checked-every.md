# ADR-079 — Doc 210: caching third-party API calls to save charges — checked every real integration in this codebase and found exactly one billable, cacheable target (the AI provider), already covered by docs 208/209; two future non-AI targets named with their trigger condition, neither built now

[← Decision log](../DECISIONS.md)


### Context

The owner asked for caching on third-party API calls specifically to save
API charges, alongside the AI-caching work in docs 208/209. Checked every
real external integration before proposing a mechanism: `PaymentProvider
.feeFor()` returns a hardcoded 0 in both real implementations, no network
call; `PaymentProvider.initiate()` is a real call but must never be cached
(each is a unique transaction); `CourierProvider.track()` is a real,
cacheable-shaped polling call, but the only built implementation is
`manual` — no real courier account exists in this deployment; the generic
ingestion/connector system (docs 160/162/172) is specified but not built.

### Options Considered

1. **Build a generic third-party-response cache now, ready for whichever
   integration comes next.** Rejected — this is scaffolding with no real
   caller today, exactly the "unused abstraction with no documented reason"
   CLAUDE.md's own rules forbid. `CourierProvider.track()`'s real caching
   parameters (rate limits, sane TTL) depend on which courier is actually
   integrated and cannot be honestly set in advance.
2. **Report that AI caching (docs 208/209) is the whole answer and stop
   there, with no record of the non-AI investigation.** Rejected — a future
   session asked the same question should not have to re-derive that
   `feeFor()` is a no-op and `manual` is the only courier driver; the
   negative finding is worth exactly as much as a positive one and is
   recorded here so it isn't repeated.
3. **Record the finding, name the two real future targets and their exact
   trigger condition (a real implementation landing), build nothing
   speculative now.** Chosen.

### Decision

Doc 210, as written. No new caching mechanism is built by this decision.
The AI-caching work already in progress (docs 208, 209) is confirmed as
the complete answer to "cache third-party calls to save charges" for this
codebase as it stands today.

### Reasoning

Every named non-target was checked against real code, not assumed absent.
The two future targets reuse doc 208's own `InProcessCache`/Redis `cache`
keyspace rather than proposing a third caching mechanism, keeping this
consistent with the architecture already decided rather than opening a
parallel one.

### Consequences

None to the running system — this is a negative result, recorded for
discoverability. The two named triggers (a real courier provider, a real
ingestion connector) are the signal for revisiting this document, not a
calendar date or a guess.

### Status
**Accepted.**
