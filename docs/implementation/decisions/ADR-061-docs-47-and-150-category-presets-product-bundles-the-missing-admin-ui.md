# ADR-061 — Docs 47 and 150 (category presets, product bundles), the missing admin UI: "start from a template" and the bundle-builder screen, both reachable now; a `withLabels()` enrichment step so a bare scalar id never reaches an admin screen

[← Decision log](../DECISIONS.md)


### Context

Doc 03 (variants/SKU/SEO) was re-checked against the running code and found
still accurate — its own status note, last re-audited 2026-09-24, correctly
names WO-3.2 (the option-model read-switch) as deliberately deferred behind
an owner-held Setting flag, and WO-3.4/3.5's remaining gap (a variant
matrix-builder UI over the already-built, already-tested pure functions in
`packages/shared/src/variant-matrix.ts`) as a real but non-blocking
convenience — the existing flat-row editor already lets a boutique create,
edit and delete every variant a product needs. Nothing there needed
building this pass. Docs 47 and 150 were a different case: both had a
fully-built, fully-tested backend (`CategoryPresetService`,
`BundlesService`, complete admin routes) with **zero UI** — not a
convenience gap, but the specific violation CLAUDE.md's "A feature ships
whole, not backend-only" rule exists to catch. WO-47.4 and WO-150.6 were
each named, in the doc's own words, as "not yet built."

### Options considered

**Whether to build a UI at all, versus leaving these as backend-verified
capabilities:** rejected leaving them — a capability reachable only by a
developer typing a raw `curl` command is not reachable by the staff member
who actually needs it (an admin populating a new deployment's category
tree, a merchandiser building a starter kit), and doc 165/166's own build
this session already established the norm of shipping the UI alongside a
newly-discovered backend-only gap rather than treating "the API works" as
done.

**How to show a bundle's own variant and component references, given
`ProductBundle.variantId`/`BundleComponent.componentVariantId` are bare
scalars in the schema, not Prisma relations (the same "cross-module
references are bare scalars" reasoning ADR-012 already established,
applied here inside one module for the same reason: doc 150's own
`onDelete: Restrict` sits on `ProductVariantOptionValue`, not this pair, so
nothing here needed a hard FK to begin with):**
1. **Resolve labels client-side**, fetching each referenced variant
   separately after loading the bundle list — rejected: no existing
   endpoint returns a variant by id in isolation, and adding a
   many-small-requests pattern for what is naturally one batched query is
   the exact N+1 shape `.claude/rules/performance.md` flags as a defect.
2. **Enrich `BundlesService.list()`/`.get()` with a `withLabels()` step** —
   selected. One batched `productVariant.findMany({ where: { id: { in:
   [...] } } })` per response, resolving every `variantId`/
   `componentVariantId` to `"Product name — Variant (SKU)"` before the
   admin screen (or any future consumer of these two routes) ever sees a
   raw id — doc 150's own "Click the number" lens, applied literally.
   `update()`/`remove()`'s own internal existence check does not need this
   enrichment (only `variantId`/`isActive`/`components.length`), so a
   separate `findOrThrow()` keeps that path from paying for a label lookup
   it never uses — and keeps the existing spec suite's prisma mock (which
   never stubbed `productVariant.findMany`) passing unchanged.

**Where to put "start from a template":** the categories admin screen's
own header, always visible, plus the empty state's primary action — doc
47's own text names the empty/first-run case explicitly, and `ui.md`'s own
"no dead end" rule requires an `EmptyState` to carry an action rather than
a bare message.

### Decision

Built: `apps/web/src/app/(admin)/admin/(app)/categories/page.tsx` gained a
`Dialog`-based preset picker (`GET category-presets` list → `GET
.../:key/preview` on selection → `POST .../:key/apply` on confirm, showing
the created/skipped/collision counts before commit, per doc 47's own dry
run requirement). `apps/web/src/app/(admin)/admin/(app)/bundles/page.tsx`
(new) is the bundle-builder screen — a debounced product/variant search
(mirroring `cross-sell-manager.tsx`'s own established pattern, flattened
from product to variant granularity since a bundle's own identity and
every component are specific variants) picks the bundle's own already-
existing variant and its components, with per-component quantity and
remove controls, wired to the existing `POST`/`PATCH`/`DELETE
/admin/catalog/bundles` routes. Both screens are `catalog.manage`-gated,
matching each document's own already-recorded permission deviation.
`BundlesService` gained `BundleView`/`withLabels()`; `list()`/`get()`
return it, `update()`/`remove()` use the new unenriched `findOrThrow()`
instead. 4 new specs (`bundles.service.spec.ts`); full apps/api suite
passing with no regression.

### Reasoning

Both UI gaps trace to the same root cause — a backend built and verified
against a real database, with its own admin routes wired, but no session
carried the work through to a human clicking it — and both are fixed the
same way: reuse an already-established UI pattern (`Dialog` for a
preview-before-commit flow, the debounced-search picker already proven in
`cross-sell-manager.tsx`) rather than inventing a new interaction model for
either. The `withLabels()` enrichment is not scope creep on top of that: a
bundle-builder screen showing `cm8x...f3` instead of "Cotton shirt — Medium
(SHIRT-M)" would be unusable by the staff member it exists for, and doc
150's own "Click the number" lens already named this exact requirement
before this pass ever started.

### Consequences

- Every future consumer of `GET /admin/catalog/bundles` (or `/:id`)
  receives resolved labels for free — a second screen never needs to
  re-solve this problem.
- A component variant deleted out from under a live bundle degrades to
  showing its own raw id rather than throwing — named explicitly in
  `bundles.service.spec.ts`, so a future change to `withLabels()` cannot
  silently regress this into a 500.
- Doc 03's own remaining gaps (the matrix-builder UI, the barcode print
  sheet) remain named and unbuilt, not silently absorbed into this pass —
  they are real convenience work, not a backend-only capability nobody can
  reach, and the doc's own 2026-09-24 status note already states this
  honestly.
- `pnpm index` must be regenerated (new route, new screen, new tests) and
  both documents' own status blockquotes and `docs/implementation/README.md`
  are updated to say exactly what shipped.

### Status
**Accepted.**
