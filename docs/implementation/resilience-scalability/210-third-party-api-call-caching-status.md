# 210 — Caching third-party API calls to save charges: one real target today, and it's already covered

> **Status: investigated (2026-09-28).** Not a new system — a finding. Every
> real, currently-integrated external call in this codebase was checked for
> a cacheable, billable-per-call read pattern before proposing anything.
> Result: **there is exactly one** — the AI provider — and it is already
> covered by docs 208 and 209. This document names the two real places a
> future non-AI cache attaches, and the exact condition that has to be true
> before either is built, rather than inventing generic infrastructure with
> no real caller today.

## 1. What was checked, and why each is not a target

**`PaymentProvider.feeFor()`** (`payment-provider.ts:95`) — checked both
real implementations. `jazzcash.provider.ts:42` and
`easypaisa.provider.ts:38` both `return 0` unconditionally. No network call
happens at all. Nothing to cache.

**`PaymentProvider.initiate()`** — a real network call, but each one is a
unique transaction (a specific order, a specific amount, a specific
timestamp). Caching this would be a correctness defect, not an optimization
— named explicitly so nobody builds it by treating "third-party call" and
"cacheable" as synonyms.

**`CourierProvider.track()`** (`courier-provider.ts`) — polling-shaped
(called by `FulfilmentCron`'s sweep), which is exactly the repeated-call
pattern worth caching if a real courier charged per tracking check. But the
only built implementation is `manual` — "there is no real courier account
to integrate against in this deployment" (the interface's own doc comment).
Caching a call that doesn't exist yet is scaffolding with no consumer,
exactly what CLAUDE.md's own rules forbid.

**The generic outbound/ingestion connector system** (docs 160, 162, 172) —
specified, not built. No real periodic-pull third-party integration exists
in this codebase today to cache.

**Identity verification, SMS/WhatsApp sends, tax/fiscal submissions** — each
is a one-shot action with no repeat-with-same-input case; there is nothing
for a cache to deduplicate.

## 2. The one real target, and where it already lives

The AI provider (`AiService`) is the only external, per-call-billed service
this codebase actually calls today with any repeat-input pattern. It is
already the subject of doc 208 (the general caching architecture, which
rules AI providers in scope for the same reasons as any other expensive
external call) and doc 209 (semantic caching for `RAG_GENERATION`
specifically, because its completions are the one AI call whose answer
depends only on question meaning). There is no separate "AI cost" problem
left uncovered by those two documents.

## 3. Where a future non-AI cache attaches, and the exact trigger

Not speculative infrastructure — a stated condition, so the next person
who integrates a real courier or a real connector checks this document
first rather than rediscovering the same reasoning:

- **`CourierProvider.track()`, the moment a real courier (PostEx, Leopards,
  TCS, or any other WO-6.3 candidate) is actually built.** A tracking
  status is a GET, idempotent, side-effect-free, and doesn't need
  per-second freshness — a short TTL cache (exact value to be set when a
  real provider's own rate limits and polling cadence are known, not
  guessed now) sits in front of it, reusing `InProcessCache`/the Redis `cache`
  keyspace doc 208 already built rather than a third cache mechanism.
- **The ingestion connectors (docs 160/162/172), the moment any one of them
  is built against a real external system.** A poll-based connector
  re-fetching the same unchanged remote data on every cycle is exactly the
  case doc 208's general L2 tier already exists for.

## Acceptance

- No cache is built by this document — its only artifact is this finding
  and the two stated triggers.
- The next agent asked to cache a third-party call checks this document
  before assuming none has been considered.

## Out of scope

Building either named future target now — neither has a real
implementation to attach to yet.
