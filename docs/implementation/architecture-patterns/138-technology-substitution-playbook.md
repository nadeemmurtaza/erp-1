# 138 — A written swap plan per core dependency, so resilience is checked, not assumed

> **Status: corrected (2026-09-26).** This document's fourth entry claimed
> a Node.js runtime bump is "a `Dockerfile` change, tested in CI before
> rollout" — verified false: `.github/workflows/ci.yml` runs lint,
> typecheck and tests directly against the Node runtime, never building or
> testing either `apps/api/Dockerfile` or `apps/web/Dockerfile`;
> `.github/workflows/deploy-cloudflare.yml` is a deployment-status
> notifier for Cloudflare Pages' own auto-build, not a Docker pipeline
> either — no CI workflow in this repository builds or tests a Docker
> image today. The Dockerfiles themselves are real (doc 94's own
> "verified" status already confirms this), and a runtime bump is
> genuinely a small, contained `Dockerfile` edit — but "tested in CI" was
> an overclaim, corrected below. Every other entry (`PasswordHasher`, doc
> 100's own outbox trigger, the provider-registry pattern) checked out
> real. See `DECISIONS.md` ADR-057.

Every extension point in this repository already makes swapping a
*provider* (a payment gateway, a notification channel) cheap. This
document covers the smaller number of dependencies that are not behind a
swappable provider interface at all — the core technology choices
themselves (Postgres, bcrypt, the outbox-based event delivery) — with one
short, honest note per dependency: if this became obsolete or
insufficient, what's the actual path.

## The playbook, one entry per core dependency

- **Postgres (via Prisma)** — swap path: doc 136's own portability audit
  is the prerequisite; the actual migration would be a new Prisma
  datasource provider plus rewriting any justified `$queryRaw` exceptions
  doc 136 catalogued. Trigger: a specific, measured performance ceiling
  Postgres itself cannot clear even after indexing/partitioning, per doc
  122's own stated trigger condition for a data lake — the identical
  discipline, applied to the primary datastore itself.
- **bcrypt (password hashing)** — swap path: already solved by doc 126's
  own `PasswordHasher` interface — register a second implementation,
  rotate on next login. No further playbook needed; this is the
  one dependency already fully agile.
- **The transactional outbox (vs. a dedicated message broker)** — swap
  path: doc 100's own stated trigger — "a measured throughput or
  delivery-latency requirement the outbox genuinely cannot meet" — adopt
  Kafka/RabbitMQ behind the identical `EventBusService.publish()`
  interface every subscriber already calls; no subscriber code changes,
  since publishing is already abstracted from its own transport.
- **`bcryptjs`/Node.js runtime itself** — swap path: this repository's
  own containerized deployment (doc 94/119) already means a runtime
  version bump is a small, contained `Dockerfile` edit rather than a
  scattered change — but it is **not yet CI-tested**: no workflow in
  `.github/workflows/` builds or runs either Dockerfile today
  (`ci.yml` tests the Node runtime directly; `deploy-cloudflare.yml` is a
  deployment-status notifier for Cloudflare Pages' own build, not a
  Docker pipeline). A future runtime bump is manually verified before
  rollout until a CI step actually builds and smoke-tests the image —
  named here as a real, small gap rather than assumed covered.
- **A specific notification/payment vendor going out of business** —
  already fully solved by the provider-registry pattern itself; no
  additional playbook entry needed beyond "register a new implementation."

## Why this is worth writing down explicitly, even where the answer is short

The value of this document is not in any single entry — most of them
restate a decision already made elsewhere. The value is that a future
reader (or this repository's own next agent session) can find *every*
core dependency's own swap story in one place, see at a glance which ones
already have a real, cheap path (four of five above) and which one
genuinely requires more work first (Postgres itself, gated on doc 136's
audit) — rather than that knowledge being scattered across a dozen
documents and reconstructed under pressure the day it's actually needed.

## Scope lenses

Not applicable — this document is a written index of already-existing
decisions; it introduces no new mechanism.

## Work orders

**WO-138.1 (documentation only)** — keep this playbook current as new
core dependencies are adopted; any future document introducing a new
non-swappable core technology choice adds its own one-paragraph entry
here, per the same discipline `DECISIONS.md` already requires for a
decision of this weight.

## Acceptance

- Every core dependency not already behind a provider-registry interface
  has a stated swap path and trigger condition in this document.

## Out of scope

Nothing further — this is a documentation exercise, not a build.
