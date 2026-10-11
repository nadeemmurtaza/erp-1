# ADR-091 — Stored files: private by default — the folder decides; a private object is served only on a short-lived signed URL, now real on the local driver; the files route accepts only canonical keys; four sensitive folders stay URL-gated as named debt

[← Decision log](../DECISIONS.md)


### Context

Found during the architecture review of doc 254 (§11, finding 2; its R-5),
then checked against the code before anything was changed.

- **Production serves every upload through one unauthenticated route.**
  `.env.production.example` ships `STORAGE_DRIVER=local`, and `Caddyfile`
  only reverse-proxies `api.<domain>` to the API (no `file_server`, no cache),
  so `GET files/*path` (`@Public()`) is the live path for every stored byte.
- **What sits behind it.** Ten callers, nine folders: `products`,
  `auction-lots` (public by design); `payment-receipts` (a customer's
  bank-transfer screenshot), `receipts` (expense receipts and supplier PDFs),
  `return-photos`, `stitching-jobs` (sensitive, and rendered by browsers from
  URLs persisted in `Payment.receiptUrl`, `Expense.receiptUrl`,
  `ReturnRequest.photoUrls`, `StitchingJobEvent.photoUrl`); `visual-search`,
  `rag-ocr` (fetched only by the API's own vision provider); `rag-sources`
  (refused by the route — security review H2).
- **H2's refusal was bypassable.** It compared the raw first path segment with
  `rag-sources`, then served the normalised path. Requests for
  `products/../rag-sources/…`, `./rag-sources/…`, `products%2F..%2Frag-sources%2F…`,
  `rag-sources%2F2026%2F…` and `rag-sources%2f…` each returned the PDF (200)
  through real Nest/Express routing in a local probe.
- **Every response was `public, max-age=31536000, immutable`**, payment
  receipts included. `/admin/payments` renders receipts through `next/image`,
  whose optimizer caches for `max(minimumCacheTTL, upstream max-age)` — so each
  receipt thumbnail was held a year in the web container's image cache,
  retrievable by anyone through `/_next/image?url=<receipt URL>`.
- **`signedUrlFor()` lied on the local driver.** It returned the permanent
  public URL. RAG OCR's "short-lived signed URL" (H2) was therefore a public
  URL on production, and `rag-ocr/` was not refused. Photo search passed
  `stored.url` itself, and never deletes its uploads.
- **Keys carried 32 random bits** behind a predictable
  `folder/yyyy/mm/<slug of the uploader's filename>-` prefix, against a global
  throttle of 300 requests per 60 s per IP.

### Options Considered

1. **Make the local driver's `signedUrlFor()` throw, and refuse every private
   folder outright.** Strictest, and no new code path on a public route — but
   OCR and photo search would stop working on every `local` deployment,
   production included, for want of a URL the vision provider can fetch.
   Rejected: it trades a fixable lie for a lost capability.
2. **Per-resource authorised byte routes in each owning module, with the web
   fetching blobs under the bearer token** (`downloadFile()`'s pattern, as RAG
   already does). The right shape for the four browser-rendered folders, but it
   touches payments, finance, stitching, fulfilment and orders, the four admin
   pages that render these URLs (payments, order detail, expenses, stitching
   job), the storefront's stitching timeline (on two pages), the mobile app's
   types, and a guest who proves a booking with a phone number has no session
   to fetch with. Not a contained fix — left as the open follow-up below.
3. **A global interceptor that rewrites every persisted storage URL in every
   API response into a freshly signed one.** Gates all four folders without
   touching a module, but it is response rewriting by magic in `core`, it
   churns the Next image cache, and pages left open past the TTL show broken
   images. Recorded as an option for the follow-up, not adopted here.
4. **Pass image bytes to the vision provider instead of a URL.** Removes the
   OCR and photo-search scratch objects altogether, and is the better long-term
   shape, but it changes the `AiProvider` extension point. Recorded for the
   follow-up.
5. **The folder decides visibility, default private; a private object is
   served only on a real short-lived signed URL, on both drivers; the route
   accepts only canonical keys; the four browser-rendered folders stay
   URL-gated, named in code as debt, with their caching and key strength
   tightened now.** Chosen.

### Decision

- **Visibility is a function of the key's folder** (`storage-visibility.ts`):
  `products` and `auction-lots` are public; `payment-receipts`, `receipts`,
  `return-photos` and `stitching-jobs` are *ungated* (sensitive, still served
  by bare URL until their owners move to authorised reads); **every other
  folder is private, including any added later** — doc 254's I8 store among
  them. `rag-sources` stays refused outright, signed or not.
- **A private object is served by `files/*path` only with a `token` query
  parameter**: a JWT signed with `JWT_ACCESS_SECRET`, HS256 only,
  `aud: 'storage-object'`, `sub: <the exact key>`, expiring at the TTL the
  caller asked for. A missing, malformed, expired or foreign token reads as
  404, so a probe cannot tell a private object from an absent one. Every
  private serve is logged with its key (never the token).
- **`signedUrlFor()` never returns an unsigned URL.** The local driver now
  signs for real (`StorageUrlSigner`); S3 already presigned. A driver that
  cannot sign rejects, and the caller handles it: OCR propagates it as an
  ingestion failure (M9); photo search answers 503 with its existing message.
- **The route serves only canonical keys** — the path as the driver stores it,
  with no `.`, `..`, empty segment or encoded slash — and reads the folder from
  that canonical key. This closes H2's bypass for `rag-sources` and keeps the
  same trick from reaching a private folder.
- **Caching**: public folders keep `public, max-age=31536000, immutable`;
  everything else (private and ungated) gets `private, no-store`, on local
  responses and as S3 object metadata at upload.
- **Keys carry 128 random bits** (16 bytes), up from 32.
- **Photo search** hands the vision provider a 300 s signed URL instead of the
  permanent one.

**Parameters** (Parameter — exact value — why this number — where — how it degrades):

| Parameter | Value | Why this number | Where | Degrades |
|---|---|---|---|---|
| Signed URL lifetime ceiling | 604,800 s (7 days) | AWS Signature V4's own ceiling for a presigned URL, so a TTL is accepted or refused identically on both drivers | `MAX_SIGNED_URL_TTL_SECONDS`, `storage-url-signer.ts` | a TTL outside 1–604,800 whole seconds rejects, on either driver |
| Photo-search signed URL lifetime | 300 s | used once, inside `describeImage()`, which `AiService` bounds at 30 s (`CALL_TIMEOUT_MS`); the rest is slack for an S3-compatible store judging a presigned URL by its own clock. The same value and reasoning as OCR's H2-reviewed `OCR_SIGNED_URL_TTL_SECONDS` | `VISUAL_SEARCH_SIGNED_URL_TTL_SECONDS`, `search.service.ts` | a leaked URL works for at most 5 minutes; an expired one is a 404, and the search answers 503 |
| Public caching | `public, max-age=31536000, immutable` | every upload mints a new random key and no code rewrites an object, so a URL's bytes never change; one year is the conventional maximum freshness lifetime | `PUBLIC_CACHE_CONTROL`, `storage-visibility.ts` | a deleted public object can stay in a cache for up to a year — acceptable only because it was public |
| Private and ungated caching | `private, no-store` | no shared cache — a CDN, a proxy, the Next.js image optimizer — may keep a copy, and no browser keeps one on disk on a shared back-office PC | `PRIVATE_CACHE_CONTROL`, `storage-visibility.ts` | each view refetches (receipts are WebP, tens of KB); the Next optimizer still holds an optimised copy for its `minimumCacheTTL`, 60 s by default in Next 15 |
| Key randomness | 16 bytes (128 bits) | for an ungated folder the URL is the only control; 32 bits behind a guessable prefix is searchable by a distributed client despite the per-IP throttle, while 128 bits — a UUIDv4-class capability — is not; more only lengthens the URL | `buildKey()`, `local-storage.driver.ts` | none; 24 more characters per URL. Existing keys keep their 32 bits |

### Reasoning

Option 5 closes every hole that `core/storage` alone can close, without
disabling a capability or touching a module's data. The signed URL reuses a
mechanism this codebase already runs twice — a short-lived JWT under
`JWT_ACCESS_SECRET` with its own `aud` (`EmbedWidgetsService`,
`FragmentsService`) — and doc 205 already calls `signedUrlFor()` "a
server-minted capability". It cannot be replayed as a session: `JwtStrategy`
looks `sub` up as a `User.id`, and a storage key contains `/`. A session,
embed or fragment token cannot open a file either, since none carries
`aud: 'storage-object'`. Classifying by folder, rather than by a column or a
key prefix, is the only design the route can apply from the key alone, with
no database read. It also covers the objects already on disk, and it is the
rule H2 already used, now applied to a canonical key.

### Consequences

- **Still exposed: the four ungated folders.** Anyone holding a receipt or
  photo URL can fetch it, and existing objects keep their 32-bit keys. The URLs
  reach staff, the order owner (customer order responses carry
  `payments[].receiptUrl`), guests tracking a booking by number and phone,
  browser histories, and Caddy's access log (`/data/access-api.<domain>.log`
  records every URI). What changed for them: no shared cache keeps a copy from
  now on, and new uploads get 128-bit keys. Closing them is the follow-up
  decision: Option 2, 3 or a combination, plus what to do with the URLs
  persisted in those four columns. Once a folder leaves `UNGATED_FOLDERS`,
  every old URL to it stops working at once — for access, that is the key
  rotation.
- **S3 needs a bucket policy to match.** Only the public folders' prefixes may
  be anonymously readable. A bucket readable as a whole makes every private
  object public at its plain URL, signed URLs notwithstanding. Code cannot
  check this, so it is stated where an operator switching drivers will read
  it: `.env.production.example`'s storage block and `S3StorageDriver`'s
  header. Production runs `local` today.
- **Tokens appear in logs.** Caddy logs query strings, and a failed vision
  fetch logs its URL (`AiService.logFailure()`, `AiUsageLog.errorMessage`).
  Each token opens one key for at most its TTL (300 s for both current
  callers) — the same property as any S3 presigned URL.
- **Rotating `JWT_ACCESS_SECRET` invalidates outstanding signed URLs.** They
  are minutes long, so nothing persists one.
- **Photo-search uploads still accumulate.** They are now private, but never
  deleted. Retention is a product decision, not part of this fix.
- **A request with a non-canonical path now gets a 404.** Browsers normalise
  `.` and `..` before sending, and no stored URL contains one, so only
  hand-built requests are affected.

### Status
**Accepted** for the contained fix above. The four ungated folders are an open
follow-up decision (Consequences, first bullet).
