# 252 — Chapter markers on the CMS video block

**Read [`08-content-marketing-search.md`](./08-content-marketing-search.md)
first.** The `video` content block it specifies is live
(`packages/shared/src/content-blocks.ts`, rendered in
`apps/web/src/components/storefront/block-renderer.tsx`) — `url`,
`caption`, `captionsUrl`, a plain native `<video controls>` element. No
chapter markers exist.

No ADR. One additive field on an existing, already-generic block type, no
new table, no new module, no new permission.

## Why this is scoped on its own, not as part of a "VSL feature"

A long-form video on a landing page — a product walkthrough, a sales
video, a how-to — is more useful with jump points than without, regardless
of what the video is *for*. This is a player-UI capability, not a sales
methodology. It belongs to every brand this platform serves, not to one
page's content strategy, which is why it is scoped here as a block-type
addition rather than as a feature named after one use case.

## Decision

`ContentBlock`'s `video` variant gains one optional field:

```ts
| {
    type: 'video';
    url: string;
    caption?: string;
    captionsUrl?: string;
    chapters?: { label: string; atSeconds: number }[];
  }
```

Validated in `content-sanitizer.ts` alongside the block's existing fields:
`atSeconds` a non-negative integer, strictly increasing across the array
(a chapter list out of order is a content-editing mistake, refused at
save, not silently reordered), `label` non-empty, capped at the existing
sanitizer's general string-length ceiling — no new ceiling invented for
this one field.

`block-renderer.tsx` renders a chapter list beside the player when present
(absent when not — the block degrades to exactly today's player). Clicking
a chapter seeks the native `<video>` element's `currentTime`; no new video
library, no new dependency. The admin content editor
(`app/(admin)/admin/(app)/content/page.tsx`) gains one repeatable
label+timestamp row pair under the existing video block's fields.

## Work orders

- **WO-252.1** — `chapters` field on the `video` `ContentBlock` variant;
  sanitizer validation (ordering, bounds).
- **WO-252.2** — Storefront renderer: chapter list UI, click-to-seek.
- **WO-252.3** — Admin content editor: add/remove/reorder chapter rows
  under a video block.

## Acceptance criteria

1. A video block with no `chapters` renders exactly as it does today —
   byte-identical player, no empty chapter rail.
2. A video block with `chapters` out of order, or with a negative
   `atSeconds`, is refused at save with a field-level error, not silently
   corrected.
3. Clicking a chapter label seeks the video to that timestamp without a
   page reload or a new network request.
4. The admin editor lets a content author add, reorder and remove chapter
   rows on an existing video block without touching its `url` or
   `caption`.

## Scope lenses

Most of the 27 headline lenses are genuinely n/a for a field addition to
an already-scoped, already-permissioned block type — stated plainly
rather than skipped.

**1. Actor** — n/a × 3: no new actor, principal or grant. The existing CMS
author (gated by `content.manage`, per doc 08) is the only actor touching
this field.

**2. Authority** — Whose rows, and which columns: unchanged, `content.manage`
already gates every write to a `Page`'s block array, chapters included,
no new column visible to a narrower role. The remaining three (threshold,
toxic pair, blast radius) are n/a: no money, no permission combination,
no rule this field lets anyone else change.

**3. The act in the world** — Request or record: a request, refusable at
save per the acceptance criteria above — this is edited content, never a
fact that already happened. The other two are n/a: no stock/cash
movement, no four-hour-outage question for a CMS edit.

**4. The money** — n/a × 6: this field posts nothing, touches no
`JournalLine`, no period, no second legal entity, computes nothing to dry
-run, and shows no number to click through.

**5. The scale** — The absent collaborator: `content` is already
off-by-default capable per doc 08; a deployment without it never sees this
field, unchanged. Three silhouettes: identical at all three editions, no
tier-bearing column. Second copy of the write: the existing `Page` update
transaction already wraps the whole block array; no new double-write
surface. Hundred-thousandth row: a chapter array lives inside one JSON
block, bounded by how many chapters one video reasonably has (tens, not
thousands) — no new table, no new index question. Adoption test: n/a, no
generated code or number series.

**6. The afterlife** — The version stamp: editing chapters on a published
page changes what a visitor sees on next load, the same as editing any
other block field today — no versioning exists for content blocks now,
and this field doesn't create a need for one. The rest (reversal document,
undo fan-out, erasure, failure path) are n/a: there is no document to
reverse, no forward-path side effect, no personal data in a chapter label
or timestamp, and a failed save is the existing form-validation failure
path, not a new durable-store question.

## Out of scope, named

- Auto-generated chapters from a transcript or silence-detection — a real,
  larger feature (needs transcription, not just a data field); not this.
- Chapter markers rendered as an overlay on the video's own scrubber (the
  way YouTube shows them) rather than a list beside it — a nicer UI, more
  player-integration work than a native `<video>` element gives for free;
  the list form ships first, the scrubber overlay is a named follow-on if
  it's ever asked for.
