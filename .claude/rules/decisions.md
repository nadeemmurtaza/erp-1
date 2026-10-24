---
paths:
  - "docs/implementation/DECISIONS.md"
  - "docs/implementation/decisions/*.md"
  - "docs/implementation/*.md"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: Loads when writing the documents that record decisions. -->

## Architectural decision records

Record significant technical decisions as one file each, `docs/implementation/decisions/ADR-NNN-short-title.md`
(next free number), plus one row in the index table in `docs/implementation/DECISIONS.md`:

```markdown
## Decision
### Context — what problem required a decision?
### Options Considered
### Decision — what was selected?
### Reasoning — why?
### Consequences — benefits and trade-offs
### Status — Accepted / Superseded / Rejected
```

Don't repeatedly revisit a settled decision without new evidence.
