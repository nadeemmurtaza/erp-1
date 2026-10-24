---
paths:
  - "apps/api/src/**/*.service.ts"
  - "apps/api/src/**/*.controller.ts"
  - "apps/web/src/**/*.tsx"
  - "apps/api/prisma/**"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: Scoped to the files where a query, a cache or a render actually lives — not to every source file, which would be the same as always-on. -->

## Performance engineering

Every technique below must be *considered* where it applies to the change
at hand — never applied blindly, and never treated as mandatory everywhere.
The correct optimization depends on the actual system, and every claim
needs a measurement (Lighthouse, Core Web Vitals, bundle size, API/DB
response time, image transfer size, JS execution cost, layout shift — not
a guess).

| Area | What to check |
|---|---|
| **Cache API responses** | HTTP / server-side / application / Redis / CDN caching where safe. Every cache states: owner, key, expiration, invalidation strategy, data-freshness requirement, auth isolation. Never cache sensitive or user-specific data incorrectly. |
| **Database indexing** | Justify by real WHERE, JOIN, ORDER BY, foreign-key and frequently-combined-column patterns; verify with `EXPLAIN ANALYZE`. No index added just because it seems generally useful. |
| **Images** | Appropriate dimensions, compression, modern formats where supported, responsive delivery, lazy loading, correct aspect ratios, prevented layout shift. Never ship oversized images unnecessarily. |
| **Loading skeletons** | Match the real content structure; avoid excessive animation; never replace a meaningful empty state; never hide an error; respect reduced-motion preferences. |
| **Expensive query caching** | Redis, materialized views, precomputed aggregates, background jobs, or request-level memoization — always with a stated freshness requirement. |
| **N+1 queries** | Fetching N records then querying related data separately per record is a performance *defect*. Fix with batch queries, joins, aggregation, eager loading, or data loaders. |
| **Debounce expensive inputs** | API requests, search, filtering, validation, autosave, suggestions. Never debounce an action that needs immediate feedback. |
| **Code splitting** | Route-level splitting, dynamic imports, lazy-loaded heavy components, deferred secondary features. Must improve loading behavior, not just multiply files. |
| **CDN evaluation** | Static assets, public images, video, large downloads, public API responses where appropriate — weighed against traffic volume, geographic distribution, cacheability, cost, security, invalidation needs. Don't add CDN infra without a reason. |
| **Server-side caching** | Public content, configuration, expensive computations, frequently-requested aggregates — every one needs invalidation logic. |
| **Pagination** | Never assume a dataset stays small. Offset, cursor, or keyset pagination on every potentially large collection — no unbounded queries. |
| **API payload compression** | Compression, field selection, DTO optimization, pagination, trimming unnecessary nested data — without sacrificing API clarity. |
| **Prevent unnecessary re-renders** | Fix via state placement, stable references, correct reactive dependencies — not excessive watchers or expensive computed values or unnecessary global state. Don't reach for memoization without understanding the actual rendering problem. |
| **Minify production assets** | Through the framework's own build pipeline only, never by hand. Watch JS/CSS bundle size, dead code, duplicate packages, unused polyfills. |
| **Lazy loading** | Below-the-fold images, secondary dashboards, heavy charts, optional integrations, large editor components. Never delay critical content. |
| **Defer non-critical scripts** | Analytics, chat widgets, tracking, ads, optional integrations must not block critical rendering. Every third-party script needs a documented purpose. |
| **Remove unused dependencies** | Before adding one: check the language stdlib, then framework capability, then existing NEWAX utilities, then whether it's actually necessary, then its security/maintenance/bundle impact. Remove what's unused. |
| **Database connection pooling** | Connections reused appropriately, pool size justified, connections released safely, serverless limits understood, exhaustion prevented. |
