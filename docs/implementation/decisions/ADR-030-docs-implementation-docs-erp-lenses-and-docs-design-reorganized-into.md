# ADR-030 — `docs/implementation/`, `docs/erp-lenses/` and `docs/design/` reorganized into domain subfolders, filenames unchanged

[← Decision log](../DECISIONS.md)


### Context
The three largest documentation trees in this repository — 163 numbered
implementation briefs, 195 scope-lens files, 16 design chapters — lived as
flat directories. `docs/implementation/`'s own README explains that its
numbering is chronological (the order requirements were found), not
topical, so "where is the promotions brief" required scanning a 171-entry
table rather than opening a folder. The owner asked for a domain-driven
structure for every `.md` file in the repository.

### Options Considered
1. Leave the flat, numbered layout and rely on the README tables and
   `docs/index/` for navigation.
2. Domain subfolders, drop the numeric prefixes and rename by content.
3. Domain subfolders, **keep every numbered filename exactly as it was**,
   only the containing folder changes.
4. Flat directory with domain-prefixed filenames, no new folders.

### Decision
Option 3, scoped exactly as the owner chose: `docs/implementation/` (163
numbered briefs), `docs/erp-lenses/` (195 files), and `docs/design/` (16
chapters) each gained domain subfolders; every filename — including the
number — is byte-identical to before the move. `docs/implementation/`'s
five meta/governance documents (`00-HOUSE-RULES.md`, `MULTI-SECTOR.md`,
`RETAIL-ERP.md`, `ENTERPRISE-SCALE.md`, `DECISIONS.md`) and its `README.md`
stayed at the tree's root — they are cross-cutting contracts CLAUDE.md
itself cites by exact path, not domain briefs. `docs/erp-lenses/`'s
underscore-prefixed process artifacts (agent drafts, judge outputs, the
cluster/conflict analyses) moved into one `_meta/` folder rather than being
sorted by domain, since they document the catalogue's own authoring
process, not a business domain. Every markdown cross-reference and every
code comment citing one of these paths was rewritten in the same change
(`git mv` plus a scripted pass resolving each `.md` file's relative links
against its own old and new location) — `pnpm check:links` and a
471-link internal-cross-reference sweep both pass clean afterward, with the
sole exception of eight links inside `docs/erp-lenses/_meta/` that were
already unresolvable before this move (a pre-existing "root-style" link
written without a leading `./`) and were deliberately left in the same
broken shape rather than silently "fixed" as an unrelated change.

### Reasoning
Keeping the numeric prefix matters more than it looks: every prose
cross-reference in this corpus ("doc 30", "WO-19.6", "doc 155's own words")
cites a document **by number**, never by folder, so a domain move that
preserved the filename left every one of those thousands of bare-number
citations valid with zero edits — only the minority written as an actual
markdown link or literal path needed rewriting. Dropping the numbers
(option 2) would have broken that convention wholesale for no navigational
gain. Domain folders were chosen per file's actual subject rather than the
README's own chronological batches (a 92–143 "architecture audit" batch,
for instance, split across `architecture-patterns/` and
`integrations-connectivity/` by what each document is actually about), so
the folder someone opens now answers "what is this about," while `docs/
implementation/README.md`'s own table still answers "in what order was
this decided."

### Consequences
- Every future reference to one of these documents should cite its full
  path including the domain folder (or the bare number/filename, which
  remains unambiguous) — a bare `docs/implementation/05-promotions-
  giftcards.md` link now 404s; `docs/implementation/promotions-giftcards/
  05-promotions-giftcards.md` is correct.
- `pnpm index` regenerates `docs/index/` from the moved tree automatically;
  nothing under `docs/index/` was hand-edited.
- The eight pre-existing broken links named above are unchanged business as
  usual — fixing them was out of scope for this move and is tracked here
  only so a future reader does not mistake them for a defect this ADR
  introduced.

### Status
**Accepted.**
