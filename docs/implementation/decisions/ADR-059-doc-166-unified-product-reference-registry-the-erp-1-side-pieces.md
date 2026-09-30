# ADR-059 — Doc 166 (unified product reference registry), the erp-1-side pieces: `adopt()`/`apply()` split instead of one method; WO-166.5 (moderation) is not erp-1's work; the platform's own outbound dispatcher stays unbuilt for the same reason apps/platform has no other outbox infrastructure

[← Decision log](../DECISIONS.md)


### Context

ADR-048's own build-time follow-up shipped WO-166.1/166.2/166.6 on the
platform side and left WO-166.3 (erp-1-side autofill UI), WO-166.4
(erp-1-side sync consumer) and WO-166.5 (moderation screen) named but
unbuilt. This session built the genuinely erp-1-side pieces. Doing so
surfaced three questions doc 166's own text does not fully answer: whether
"apply the reference" is one method or two, whether WO-166.5 belongs to
this build at all, and what to do about the platform's own outbound sync
dispatcher that §2 assumes exists.

### Options considered

**One write method, or two:**
1. **A single `apply()` used both when a staff member accepts an autofill
   and when a later sync delivery arrives** — rejected. The two moments
   need different behavior: accepting an autofill happens immediately
   after the product's own normal save already wrote whatever the staff
   member kept or edited from the preview, so re-writing
   `name`/`description`/`careInstructions` from the "canonical" reference
   at that point would silently discard an edit made seconds earlier — the
   opposite of doc 166's own "the staff member reviews and saves." A later
   sync delivery, by contrast, exists ONLY to propagate exactly that kind
   of edit to every linked tenant — refusing to overwrite text there would
   defeat the entire mechanism.
2. **`adopt()` for the tenant's own explicit accept, `apply()` for an
   inbound delivery** — selected. `adopt()` stamps provenance
   (`sourcedFromGlobalReferenceId`/`sourcedFromReferenceUpdatedAt`) and
   writes the reference's own images (which the ordinary upload form has
   no way to bring in from a remote URL) without touching translation text
   that already exists; it only creates a translation for a locale the
   product doesn't have yet. `apply()` overwrites text, but only on a row
   still carrying the SAME reference's own marker, and only when the
   incoming `updatedAt` is newer than what was last applied — the
   redelivery-idempotency and "never silently clobbered" guarantees doc
   166 §2 asks for.

**Whether WO-166.5 (moderation) belongs to "build the erp-1-side pieces":**
1. **Build it anyway, as an erp-1 admin screen** — rejected: doc 166's own
   Work Orders section labels WO-166.5 "(platform staff)", not
   erp-1-side, for a concrete reason — `GlobalProductReferenceFlag` is a
   platform-side table, and moderating it is an ops action, not a tenant
   action. Building it inside erp-1 would mean either exposing another
   tenant's flag data to every tenant (a real cross-tenant data leak) or
   scoping it to "flags this tenant raised," which is not what a
   moderation screen for ops staff needs to do.
2. **Build a first ops console for `apps/platform`** — rejected for this
   pass: `apps/platform` is a NestJS API with no frontend of any kind
   today (`OpsAuthGuard`'s own callers are curled/scripted, not clicked).
   Standing one up is a real, standalone architectural decision — which
   framework, which auth flow for ops staff, where it deploys — far larger
   than one moderation screen, and not something this document's own scope
   asked for.
3. **Name it honestly as out of this pass's reach, exactly like doc 165's
   own nID blocker** — selected. Doc 166's own status note and
   `docs/implementation/README.md`'s entry both say plainly that WO-166.5
   needs a platform ops console that does not exist, rather than silently
   building the wrong-shaped version of it or silently dropping it.

**The platform's own outbound sync dispatcher:**
1. **Build it now, alongside the erp-1-side consumer** — rejected: §2
   describes it as reusing "the identical at-least-once, backed-off outbox
   delivery doc 18.3 already built," but that pattern (`EventBusService`/
   `OutboxDispatcher`) lives entirely in `apps/api`. `apps/platform` has no
   outbox or domain-event infrastructure of its own — building one now
   would be a new piece of shared infrastructure for a second NestJS app,
   not "the erp-1-side pieces" this session was asked to build.
2. **Build the erp-1-side consumer (`apply()` plus the inbound webhook)
   ahead of its sender, tested against a simulated delivery** — selected,
   mirroring doc 18.5's own EDI-adapter deferral pattern exactly: shape the
   receiving side so a real request is not a design exercise, without
   inventing the sending side speculatively.

### Decision

Built: `ProductTranslation.sourcedFromGlobalReferenceId`/
`sourcedFromReferenceUpdatedAt` and `ProductImage.sourcedFromGlobalReferenceId`
(additive columns, migration `20260926210218_wo166_product_reference_sync_provenance`);
`ProductAdminService.update()`'s translation upsert now clears both
`ProductTranslation` fields on every ordinary edit, which is what makes a
later hand-edit "a deliberate override" rather than a state nothing ever
reset. `ProductReferenceSyncService.adopt()`/`.apply()` as scoped above.
`ProductReferencesController` (`GET .../lookup`, `POST .../apply`,
`POST .../register`, `catalog.manage`-gated) and
`MarketplaceWebhookController`/`MarketplaceWebhookGuard` (`@Public()`,
authenticated by the SAME `MARKETPLACE_API_KEY` this tenant already holds
for its own outbound calls — never a second credential, restated from doc
165's own "one credential authenticates both capabilities"). The product
editor's own barcode field triggers the lookup on blur, gated behind the
`marketplace` module so a deployment without it fires no extra request;
`BarcodeReferencePreview` shows the match and writes nothing until "Fill
from shared listing" is clicked; a genuinely new barcode is registered
silently after save, exactly matching §2's own "the form behaves exactly
as it does today."

### Reasoning

Every one of these three decisions traces to the same principle: build
what was actually asked (the erp-1-side pieces), name what depends on
infrastructure or a surface that does not exist rather than inventing it
speculatively or silently dropping it. The `adopt()`/`apply()` split is not
an added abstraction for its own sake — it is the direct consequence of
the two callers needing incompatible answers to "should this overwrite
existing text," and merging them would have silently picked the wrong
answer for one of the two. Declining to build a platform ops console or a
platform outbox mirrors this repository's own established discipline
(doc 18.5, ADR-047's own nID deferral) of shaping a receiver ahead of its
sender rather than building both halves of a mechanism whose other half
depends on a decision — a framework choice, an auth flow — this document
was never asked to make.

### Consequences

- A staff member's own edit to a product's name/description/care
  instructions, made through the ordinary product form, always clears
  `sourcedFromGlobalReferenceId`/`sourcedFromReferenceUpdatedAt` — anyone
  auditing why a product "stopped syncing" should look here first, not at
  `ProductReferenceSyncService` itself.
- `ProductReferenceSyncService.apply()` has no live caller today (no
  platform-side dispatcher exists to invoke the webhook it backs) — it is
  fully covered by unit tests against a simulated delivery, the same
  "tested but not yet exercised end-to-end" state doc 18.5's own EDI
  translator interface has always been in.
- WO-166.5 remains genuinely unbuilt, not deferred inside erp-1's own
  scope — a future session building a platform ops console (for this or
  any other ops-facing screen `apps/platform` will eventually need) should
  treat that as its own architectural decision, not a continuation of this
  document.
- `pnpm index` must be regenerated (new module files, migration, routes,
  tests) and the doc's own status blockquote and
  `docs/implementation/README.md` entry are both updated to state exactly
  what is built versus still blocked.
### Status
**Accepted.**
