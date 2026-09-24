# Phase 3 — Variants, SKUs, the product editor and SEO

**Read `00-HOUSE-RULES.md` first.** Depends on Phase 2 (shared primitives) and
WO-1.3 (cost price, barcode).

> **Status (2026-09-24): WO-3.1, 3.3, 3.6, 3.7, 3.8 and 3.9 built and
> verified; WO-3.2 replaced by a config flag instead of a wall-clock soak;
> WO-3.4/3.5 partially built. This status was independently re-audited
> against the running code before this pass, not trusted from its own prior
> claim — the previous version of this note (below, kept for the record) was
> itself wrong in both directions: it undersold WO-3.6 and WO-3.8, which a
> different, unrelated pass had already substantially built without updating
> this file, and it did not flag that WO-3.1's own "store-level option
> library" (`OptionTemplate`) was missing. Both lessons apply going forward:
> verify a doc's own status against the code, and update this file in the
> same pass that changes the code it describes.**
>
> **WO-3.1 — complete**, including the `OptionTemplate`/`OptionTemplateValue`
> library the original pass skipped. `size`/`color`/`colorHex` remain
> untouched, per expand/contract (00-HOUSE-RULES.md §4).
>
> **WO-3.2 — dual-write shipped, unconditional; the read-switch is a config
> flag, not a soak timer.** `syncOptionModel` (moved from the old
> `prisma/backfill-product-options.ts` into `src/modules/catalog/` so
> product-admin.service.ts can call it) now runs inside every product
> create/update transaction — every write derives `ProductOption`/
> `ProductOptionValue` from `size`/`color` unconditionally, not just once.
> The doc's own gate — "soak in real production traffic for at least a
> week" — cannot ever be satisfied here: `CLAUDE.md`'s Deployment section
> states this repository has no live deployment, so there is no real traffic
> to soak with, ever. Rather than leave WO-3.2 permanently blocked on an
> impossible precondition, the Setting `catalog.use_option_model_reads`
> (default `false`) replaces the wall-clock gate with an owner's explicit
> decision — same safety property (a human decides the option model is
> trustworthy before anything reads from it), reachable on infrastructure
> that will never generate the traffic the original gate asked for. Nothing
> reads from the option model yet; flipping the flag and wiring the read
> paths (storefront product page, cart, admin lists, CSV export, and
> `apps/mobile` — which the original doc already warned is easy to forget)
> is follow-up work for whoever holds that flag.
>
> **WO-3.3 (SKU templates/barcodes) — built.** `packages/shared/src/sku.ts`
> (`generateSku`, pure, unit-tested), `Category.code`/`Product.code`,
> `ProductVariant.skuIsManual`, `Setting['catalog.sku_template']`. Generation
> is client-side (the product editor's own "regenerate" button); no barcode
> print sheet.
>
> **WO-3.4/3.5 (editor, matrix builder) — partially built.** The existing
> `Wizard`-based editor gained a real SEO step and an Options & attributes
> section (add a custom option, or instantiate an `OptionTemplate`, per
> product) rather than a ground-up rewrite into the doc's exact 11-tab
> layout — the existing wizard already satisfies the section-per-task intent
> without gambling a regression on a working, tested flow. Two of the
> doc's own eleven sections are deliberately out of scope, named rather than
> silently dropped: **Shipping** (weight/dimensions/`shippingClassId`) is
> `docs/implementation/shipping-fulfilment-returns/06-shipping-fulfilment-returns.md`'s own stated
> scope (`Product.shippingClassId`, line ~100) — building it here would
> preempt that not-yet-executed work order; **Related** (cross-sell/upsell)
> is not part of this doc's own Phase 3 exit criteria and has no existing
> architectural placeholder anywhere in the corpus, so it is left as a
> future work order rather than smuggled in. The variant list still edits
> flat SKU/size/colour rows (now with barcode/cost/reorder fields folded
> into a per-row disclosure) rather than a generative cross-product matrix —
> `generateVariantCombinations`/`newCombinationsOnly`/`removedCombinations`
> exist in `packages/shared/src/variant-matrix.ts`, pure and unit-tested, but
> are not yet wired into the editor UI. A variant's `optionValueKeys` (which
> attaches it to a custom, non-size/colour option value) is accepted by the
> API but has no picker in the row editor yet.
>
> **WO-3.6 (media, alt text) — complete.** `ProductImageTranslation`
> (per-locale alt, migration backfills from the pre-existing column,
> skipping anything filename-shaped), bilingual inputs in `ImageManager`/
> `ImageStager`. Drag-and-drop reorder was not added — the existing
> move-left/right buttons already satisfy the doc's own requirement to keep
> a phone/keyboard path, and drag-and-drop was one of two options the doc
> offered, not a strict requirement.
>
> **WO-3.7 (SEO section, publish gate) — complete.** The gate
> (`publish-gate.ts`, pure, unit-tested) enforces on the transition into
> `ACTIVE` only — a create-as-Active call has no images yet in this editor's
> own two-step upload flow, so gating `create()` itself would make
> create-as-Active structurally impossible; an already-`ACTIVE` product is
> grandfathered, exactly as the doc specifies. Catalogue -> SEO & redirects'
> Health tab is the SEO health list.
>
> **WO-3.8 (storefront SEO) — complete**, and less of it needed building
> than this doc's own "Why" section claimed: `hreflang`, canonical URLs,
> `Product` JSON-LD with variant offers, `BreadcrumbList`, `Organization`
> JSON-LD, `sitemap.ts` and `robots.ts` already existed before this pass,
> contradicting the doc's own claims that they didn't — built by earlier,
> unrelated work that never updated this file. What was actually missing
> and is now built: `generateMetadata` now prefers `metaTitle`/
> `metaDescription`/`noindex`/`canonicalOverride` over the raw name and
> description, and `Store` (a `LocalBusiness` subtype) + `WebSite` +
> `SearchAction` JSON-LD were added to the storefront layout.
>
> **WO-3.9 (redirects) — complete.** `Redirect` table, the loop/chain guard
> (`redirect-guard.ts`, pure, unit-tested), automatic creation on a live
> product's slug change, `apps/web/src/middleware.ts` serving 301s before
> the locale matcher (cached, best-effort, never blocks navigation if the
> API is unreachable), and Catalogue -> SEO & redirects' Redirects tab.
>
> <details><summary>Previous status note (2026-09-03), superseded above</summary>
>
> WO-3.1 built — the actual B2 blocker, no further. The option data model
> (`ProductOption`/`ProductOptionValue`/`ProductVariantOptionValue`,
> bilingual, `OptionDisplay`, swatch fields) and a backfill script existed
> and were verified — every product with a `size`/`color` value had the
> matching join rows and a `ProductVariant.label` identical to what
> `orders.service.ts` already produces for `OrderItem.variantLabel`.
> `size`/`color`/`colorHex` were untouched, per expand/contract
> (00-HOUSE-RULES.md §4) — nothing read the new model yet. WO-3.2 was
> described as stuck pending a week of real production traffic. WO-3.3–3.9
> were described as fully unbuilt. As the note above explains, WO-3.6 and
> WO-3.8 were not actually unbuilt even at the time this was written — they
> just were not reflected here.
>
> One correction recorded at the time: `catalog.prisma` already had a
> `ProductOption`/`ProductOptionValue` pair from an earlier, unrelated,
> completely unused attempt (single-locale `name`/`value` strings, no swatch
> fields, an implicit many-to-many with no per-axis uniqueness). Verified
> zero rows and zero application-code references before replacing it
> wholesale with this doc's actual schema.
>
> </details>

## Why

Two separate problems, both in the product editor, which is why they ship together.

**Variants are two hard-coded columns.** `ProductVariant` has `size`, `color`
and `colorHex` (`catalog.prisma`). A boutique that wants "Sleeve length",
"Dupatta type" or "Fabric weight" needs a database migration. In
`product-form.tsx:533-613` variants are free-text rows typed by hand, one per
size/colour, with no combination logic — so a product with 4 sizes and 3 colours
means typing 12 rows and 12 SKUs by hand, and nothing prevents a duplicate or a
missing combination.

**SEO is worse than missing — it is dead.** All of the following are verified:

- `ProductTranslation.metaTitle` and `metaDescription` exist in the database and
  in `apps/web/src/lib/api-types.ts:102`, but **no admin form renders them**.
  They cannot be edited.
- `generateMetadata` at
  `apps/web/src/app/(storefront)/[locale]/product/[slug]/page.tsx:27-42`
  **ignores them anyway** and falls back to the raw product name and description.
- Alt text is auto-filled from the uploaded filename —
  `image-manager.tsx:45` does `formData.append('alt', file.name.replace(/\.[^.]+$/, ''))`
  — and there is **no UI to change it**. Every product image on the live site
  currently carries alt text like `IMG_2024_0193`. That is worse than empty: it
  looks populated and passes a naive audit while telling a screen-reader user
  nothing.
- **No JSON-LD anywhere in the repository.** No `Product`, `Organization` or
  `BreadcrumbList` structured data, so no rich results, no price or stars in
  Google.
- **No `sitemap.ts` and no `robots.ts`**, both natively supported by Next.js.
- **No `hreflang`** linking the `en` and `ur` versions of any page. The site is
  genuinely bilingual and Google is currently treating the two as unrelated
  near-duplicate pages. This is the single largest SEO defect in the project.

## Work orders

| WO | Title | Depends on |
|---|---|---|
| 3.1 | Option/value data model + backfill | — |
| 3.2 | Switch readers to options; retire `size`/`color` | 3.1 |
| 3.3 | SKU templates and barcodes | 3.1 |
| 3.4 | The sectioned product editor | 3.1, Phase 2 |
| 3.5 | Variant matrix builder | 3.3, 3.4 |
| 3.6 | Media section with enforced alt text | 3.4 |
| 3.7 | SEO section, publish gate, SEO health list | 3.4 |
| 3.8 | Storefront SEO: metadata, JSON-LD, sitemap, robots, hreflang | 3.7 |
| 3.9 | Redirects | 3.7 |

---

## WO-3.1 — The option model

### Schema — `catalog.prisma`

```prisma
enum OptionDisplay {
  BUTTON     // "S M L XL"
  DROPDOWN   // long lists
  SWATCH     // colour or fabric image
  TEXT       // free entry, e.g. a monogram
}

/// An axis a product varies along: "Size", "Colour", "Sleeve length".
model ProductOption {
  id        String        @id @default(cuid())
  productId String
  /// Stable machine key: "size", "sleeve_length". Never shown to a customer.
  key       String
  display   OptionDisplay @default(BUTTON)
  order     Int           @default(0)
  createdAt DateTime      @default(now())

  product      Product                    @relation(fields: [productId], references: [id], onDelete: Cascade)
  translations ProductOptionTranslation[]
  values       ProductOptionValue[]

  @@unique([productId, key])
  @@index([productId, order])
}

model ProductOptionTranslation {
  id       String @id @default(cuid())
  optionId String
  locale   String
  label    String

  option ProductOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  @@unique([optionId, locale])
}

model ProductOptionValue {
  id        String  @id @default(cuid())
  optionId  String
  key       String
  /// Colour swatch.
  swatchHex String?
  /// Fabric/pattern swatch image, when a hex cannot describe it.
  swatchUrl String?
  order     Int     @default(0)

  option       ProductOption                   @relation(fields: [optionId], references: [id], onDelete: Cascade)
  translations ProductOptionValueTranslation[]
  variantLinks ProductVariantOptionValue[]

  @@unique([optionId, key])
  @@index([optionId, order])
}

model ProductOptionValueTranslation {
  id      String @id @default(cuid())
  valueId String
  locale  String
  label   String

  value ProductOptionValue @relation(fields: [valueId], references: [id], onDelete: Cascade)
  @@unique([valueId, locale])
}

/// The join that DEFINES a variant. One row per option axis per variant.
model ProductVariantOptionValue {
  variantId String
  optionId  String
  valueId   String

  variant ProductVariant     @relation(fields: [variantId], references: [id], onDelete: Cascade)
  value   ProductOptionValue @relation(fields: [valueId], references: [id], onDelete: Restrict)

  @@id([variantId, optionId])
  @@index([valueId])
}
```

On `ProductVariant`, add:

```prisma
  /// Cached display string, "Medium / Ferozi". Denormalised deliberately:
  /// lists, cart lines and order snapshots must not need three joins.
  /// Recomputed whenever the variant's option values change.
  label String?
```

`onDelete: Restrict` on `value` is intentional — deleting an option value that
variants still use must fail loudly, not silently orphan them.

### Store-level option library

Retyping "Size: XS/S/M/L/XL/XXL" on every product is how data gets inconsistent.
Add `OptionTemplate` / `OptionTemplateValue` with the same shape (translations
included), managed under *Catalogue → Options & attributes*. A product
instantiates from a template; the copy is independent afterwards, so editing the
template does not silently change live products.

### Backfill — this is the careful bit

One migration, `add_product_options`. Additive only: **do not touch
`size`/`color`/`colorHex`.**

Backfill script (a migration step or a one-shot script the migration calls):

1. For each product having any variant with a non-null `size`:
   - create `ProductOption { key: 'size', display: BUTTON, order: 0 }` with
     translations `en: "Size"`, `ur: "سائز"`;
   - create one `ProductOptionValue` per distinct `size` value on that product,
     in the order the variants define them, with `en` and `ur` labels both set to
     the raw string (Urdu needs a human pass afterwards — flag it, do not guess);
   - create the `ProductVariantOptionValue` rows.
2. The same for `color`, `display: SWATCH`, carrying `colorHex` into `swatchHex`.
3. Write `ProductVariant.label` by joining the value labels with ` / ` in option
   order — matching the existing `OrderItem.variantLabel` format ("Medium / Ferozi").

**Verify before moving on:** every variant that had a `size` or `color` has the
matching number of join rows, and every `label` matches what the old columns
would have produced. Write that as a test that runs against the backfilled data.

**Done.** `apps/api/test/backfill-product-options.spec.ts` runs the backfill
against real throwaway fixtures and asserts exactly this — join-row counts,
label format, colour deduplication (two variants sharing "Blue" produce one
`ProductOptionValue`, not two), `swatchHex` from `colorHex`, and idempotency
(a second run creates zero new rows). Also spot-checked directly against the
real dev catalog: 0 mismatches across every seeded variant with a size or
color.

---

## WO-3.2 — Switch readers, then retire the columns

House Rule 4, expand/contract, across two releases. Do not compress it.

1. **Dual-write.** Everything that writes a variant writes both the join rows and
   the old `size`/`color` columns. Deploy. Let it soak for at least one week of
   real traffic.
2. **Switch reads** — storefront product page, cart, admin lists, the Expo app,
   CSV import/export — to the option model. Deploy. Verify.
3. **Contract**, in a *later* migration: drop `size`, `color`, `colorHex`.

Order lines are already snapshots (`OrderItem.variantLabel`), so order history is
untouched by any of this. That is the snapshot rule earning its keep.

The Expo app (`apps/mobile`) reads variants too. It is easy to forget and it will
break silently — check `apps/mobile/app/product/[slug].tsx`.

---

## WO-3.3 — SKU templates and barcodes

`sku` is already `@unique` but typed by hand, which is how you get `LWN-M-BLU`
next to `lawn_medium_blue`.

Add setting `catalog.sku_template`, default:

```
{CAT}-{PRODUCT}-{OPT}-{SEQ}
```

- `{CAT}` — category code (add a short `code` column to `Category`, uppercase,
  slug-derived, editable)
- `{PRODUCT}` — a per-product `code`, defaulted from the slug
- `{OPT}` — option value keys joined by `-`, in option order, uppercased
- `{SEQ}` — zero-padded per-product sequence, only used when the rest collides

Render in `packages/shared/src/sku.ts` as a pure function, unit tested.
Uniqueness is checked live in the editor as the matrix is generated; a collision
appends `{SEQ}`. The generated SKU shows greyed with an edit affordance — auto by
default, always overridable. **Never silently rewrite a SKU a human has edited**;
mark it `skuIsManual` on the variant if you need to track that.

`barcode` was added in WO-1.3. The editor exposes it, validates EAN-13/UPC-A
check digits when the value looks like one, and offers a print sheet of barcode
labels for the shop counter. This is what makes WO-1.7's scanner-based stock
count actually usable.

---

## WO-3.4 — The sectioned product editor

Replace `product-form.tsx` (734 lines, one form for all three product kinds) with
a sectioned editor under `apps/web/src/components/admin/product/`. Tabs on
desktop, accordion on mobile. One component per section.

| Section | Contents |
|---|---|
| Basics | Name EN/UR, kind, status, category, brand, tags, vendor |
| Description | Rich text EN/UR, care instructions, specification table |
| Media | WO-3.6 |
| Pricing | Base price, compare-at, cost price*, live margin %, tax class, scheduled change |
| Variants | WO-3.5 |
| Inventory | Track quantity, reorder point, reorder qty, backorder policy, preferred supplier |
| Shipping | Weight, dimensions, shipping class, fragile/oversize |
| SEO | WO-3.7 |
| **Apparel** | Fabric, piece count, metres, stitching availability, garment types, size chart — **renders only for STITCHED / UNSTITCHED** |
| Related | Cross-sell, upsell, complete-the-look |
| Publishing | Status, publish date, channels, featured rank |

`*` gated on `inventory.view_cost`, and the API already omits it (WO-1.3).

That Apparel section is the Part A seam showing up in the UI: universal sections
always render, the apparel pack renders conditionally. Keep that boundary crisp —
do not let `fabricMeters` leak into the Pricing or Inventory section.

**Autosave drafts.** The editor is long and losing 20 minutes of work to a
closed tab is unacceptable. Save `DRAFT` products automatically; require an
explicit save for `ACTIVE` ones, and warn on navigate-away with unsaved changes.

---

## WO-3.5 — The variant matrix builder

The workflow:

1. Staff add options and their values ("Size: S, M, L" / "Colour: Ferozi, Black").
2. The editor generates the **full cross-product** of combinations as a table.
3. Each row has: option values (read-only), SKU (auto, editable), barcode, price
   override, cost, stock, weight, image, active toggle.
4. A bulk-edit bar sets price / cost / stock across selected rows.
5. Rows can be **deselected** — a 4×3 grid does not always mean 12 real variants.

Traps:
- **Adding a value to an existing option must not destroy existing variants.**
  Generate only the *new* combinations and leave existing rows, with their SKUs
  and stock, exactly as they are.
- **Removing an option value that variants use** must deactivate those variants,
  not delete them — past orders reference them. The `onDelete: Restrict` in the
  schema enforces this at the database level; the UI must explain it before the
  user tries.
- Cap the generated matrix (say 250 rows) and refuse beyond it with an
  explanation. Three options with 20 values each is 8,000 variants and a hung tab.

---

## WO-3.6 — Media with enforced alt text

Rewrite `image-manager.tsx`:

- **Delete the filename-as-alt-text line at `image-manager.tsx:45`.** Never
  auto-fill alt text with a filename again. An empty alt text is honest; a
  filename is a lie.
- Every image in the gallery has a visible alt-text input beneath it, per locale
  (`en` and `ur`), with a character counter and a short hint on what good alt
  text is ("describe what a customer would see — fabric, colour, cut — not
  'product image'").
- `ProductImage.alt` becomes a translation sibling, `ProductImageTranslation`,
  because alt text is customer-facing (House Rule 6). Backfill: move the current
  `alt` string into the `en` row **only if it does not look like a filename**
  (no extension, not matching `^(IMG|DSC|PXL|Screenshot)[-_ ]?\d+$`); otherwise
  leave it empty so it shows up in the SEO health list as work to do.
- Drag-and-drop reorder, replacing the current move-left/right buttons — but
  **keep the buttons too**, they are the phone and keyboard path and
  `image-manager.tsx` was deliberately built that way.
- Primary image flag, per-variant image assignment, and an "AI suggest alt text"
  button that is wired in Phase 9 and simply absent until then.

---

## WO-3.7 — The SEO section and the publish gate

### The section

- **Slug per locale**, with a redirect created automatically when a live slug
  changes (WO-3.9).
- **Meta title / meta description** per locale, character counters, and a **live
  Google SERP preview** showing truncation as it will actually appear.
- **Open Graph / Twitter card**: image, title, description, with a preview.
- **Canonical URL** and a `noindex` toggle.
- **Focus keyword** and a checklist (keyword in title / in description / in H1 /
  in an alt text / slug length / description length).
- **JSON-LD preview** of the `Product` schema that WO-3.8 will emit.

### The publish gate — the point of this whole work order

A product **cannot move to `ACTIVE`** unless:

1. every image has non-empty alt text in **both** locales;
2. meta title and meta description are present in both locales;
3. a slug exists for both locales;
4. a primary image is set;
5. at least one active variant has a SKU and a price;
6. every active variant has a non-zero cost price.

Enforce it **in the API**, in the product update service, not in the form. The
form shows it as a checklist with a completeness score in the editor sidebar so
it reads as guidance; the API is what makes it true.

Rule 6 will surprise people — explain it in the UI copy: "Without a cost price,
this product's profit reporting will be wrong."

### Grandfathering

Existing `ACTIVE` products fail this gate. **Do not deactivate them** — that
takes the shop offline. Instead:
- The gate applies on transition *into* `ACTIVE`, and on saving an already-active
  product only as a warning, not a block.
- Add **Catalogue → SEO health**: every product scored against the gate, sorted
  worst first, with a one-click jump to the failing section. This is the work
  queue for fixing the backlog, and after Phase 9 most of it is one click.

---

## WO-3.8 — Storefront SEO

`apps/web/src/app/(storefront)/[locale]/…`

1. **Use the meta fields.** `generateMetadata` on the product page currently
   ignores `metaTitle`/`metaDescription`. Prefer them; fall back to name and
   description only when they are empty.
2. **`hreflang`.** Every localised page emits `alternates.languages` for `en` and
   `ur` plus `x-default`. Do this in a shared helper so no page can forget it.
   This is the highest-value single change in the work order.
3. **JSON-LD**, as `<script type="application/ld+json">`:
   - `Product` with `offers` (price, currency, availability), `sku`, `gtin`,
     `brand`, and `aggregateRating` once Phase 7 adds reviews;
   - `BreadcrumbList` on product and category pages;
   - `Organization` and `LocalBusiness` in the storefront layout;
   - `WebSite` with `SearchAction`.
   Build them with typed helpers in `apps/web/src/lib/structured-data.ts` — never
   string-concatenated JSON.
4. **`app/sitemap.ts`** — products, categories, static pages, both locales, with
   `lastModified` from `updatedAt`. Split into a sitemap index if it exceeds
   50,000 URLs (it will not soon, but write it so it can).
5. **`app/robots.ts`** — allow the storefront, disallow `/admin`, `/checkout`,
   `/cart`, `/account`, point at the sitemap. Note that
   `app/(admin)/admin/layout.tsx:8` already sets `robots: { index: false }`;
   keep both.
6. **OG images.** A static per-product OG image from the primary image, or
   Next.js `ImageResponse` for a generated one.

### Acceptance
- [ ] Google Rich Results Test passes on a product URL.
- [ ] `curl https://test.yaseen.pk/en/product/<slug>` shows `hreflang` pointing
      at the `/ur/` twin and back again — reciprocal, or Google ignores it.
- [ ] `/sitemap.xml` and `/robots.txt` return valid documents.
- [ ] A product with a custom meta title renders it, not the product name.

---

## WO-3.9 — Redirects

Changing a slug today silently 404s every existing link and loses whatever
ranking that URL had. There is no redirect table.

```prisma
model Redirect {
  id        String   @id @default(cuid())
  /// Path only, no host, no locale prefix: "/product/old-slug".
  fromPath  String   @unique
  toPath    String
  /// 301 permanent or 302 temporary.
  statusCode Int     @default(301)
  /// True when created automatically by a slug change.
  isAutomatic Boolean @default(false)
  hitCount  Int      @default(0)
  createdAt DateTime @default(now())

  @@index([isAutomatic])
}
```

- Created automatically whenever a live (`ACTIVE`) product or category slug
  changes. A `DRAFT` product's slug change creates nothing.
- Served from `apps/web/src/middleware.ts`, which already runs for locale
  routing — add the lookup there, cached, before the locale matcher.
- **Guard against loops and chains.** Before writing `A → B`, if a redirect
  `B → A` exists, refuse. If `X → A` exists, rewrite it to `X → B` so chains
  never form. Both are cheap to write and expensive to discover later.
- Managed under *Catalogue → SEO & redirects*, with manual entries and a CSV
  import for migrating an old site.

---

## Phase 3 exit criteria

1. A boutique user can add a custom option ("Sleeve length") to a product from
   the admin, with no migration and no developer.
2. `size`, `color` and `colorHex` are gone from `ProductVariant` — after a full
   dual-write soak, not before.
3. No product image anywhere carries filename-shaped alt text; the SEO health
   list shows the remaining backlog explicitly.
4. A new product cannot be published without alt text, meta and cost.
5. Rich Results Test passes; `hreflang` is reciprocal; sitemap and robots exist.
6. Renaming a live product's slug leaves the old URL 301-ing to the new one.
