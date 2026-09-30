# ADR-016 — Rules that apply to one kind of file are path-scoped

[← Decision log](../DECISIONS.md)


### Context
`CLAUDE.md` was ~12,500 tokens loaded on every session, every non-Claude tool
and every new agent — the largest fixed cost in the repository, and growing,
because more rules are coming.

### Options Considered
- Leave it whole and accept the cost.
- Compact it by summarising, accepting some loss of rule and reasoning.
- Move job-specific rules into `.claude/rules/*.md` with `paths:` frontmatter,
  which Claude Code loads only when a matching file is opened.

### Decision
**Path-scoped rule files.** Twelve sections moved verbatim into nine topic
files. `CLAUDE.md` keeps an index naming every one, what it governs and when it
loads. Nothing was reworded or summarised.

### Reasoning
Summarising trades rules for tokens, and the rule that gets trimmed is the one
nobody was applying anyway — which is the one most worth keeping. Scoping trades
nothing: a rule that arrives the moment you open the file it governs is *more*
likely to be followed than one skimmed in a 12,000-token preamble. The index
keeps every rule visible at all times, so an agent planning work it has not yet
opened files for still knows the rule exists.

### Consequences
- Always-on context fell from ~12,510 to ~9,658 tokens; ~4,474 became
  conditional.
- Scoping introduces a failure mode the single file never had: a rule can become
  unreachable silently — a typo in a glob is a rule that has quietly stopped
  applying. `scripts/check-rules.mjs` guards it and runs in `pnpm lint`.
- Every rule file states that it is **binding**, so scoping is never read as
  optionality.
- Adding a rule: everything → `CLAUDE.md`; one kind of file → the matching rules
  file plus a row in the index. The checker fails the build if those disagree.

### Status
Accepted.
