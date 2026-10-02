<!-- POINTER FILE — not a new log to write to; see below for where each kind of memory actually lives. -->

# Memory

"What has already been decided, and why" lives in four places in this
repository, each answering a different question. This file does not add
a fifth — it says which of the four to open.

| If you need to know... | Look here |
|---|---|
| **Why a specific architectural choice was made** — including the two the owner made, then explicitly reconsidered and reversed after new evidence | [`docs/implementation/DECISIONS.md`](./docs/implementation/DECISIONS.md) — every decision in Context/Options/Decision/Reasoning/Consequences/Status form. `.claude/rules/decisions.md` is the binding rule: record it here, and "don't repeatedly revisit a settled decision without new evidence." |
| **What changed, when, and the reasoning at the time** — the literal, permanent record | `git log` on this repository. Every commit message this project's own history was built from states not just what changed but why — that history is never rewritten (`CLAUDE.md`'s own git-discipline and no-deletion rules exist specifically to keep it trustworthy). |
| **What exists today, and where** | [`docs/implementation/README.md`](./docs/implementation/README.md) — kept current after every new document; and [`docs/index/`](./docs/index/) (`pnpm index` to regenerate) — a generated, always-accurate structural snapshot of the actual code: every route, table, event, permission, component, and which document explains why it exists. |
| **What a named feature or capability must include to count as done, so nothing has to be re-decided next time** | `CLAUDE.md`'s "Feature scope: build the whole capability" section (the standing instruction and the boundary), the [`feature-scope` skill](./.claude/skills/feature-scope/SKILL.md) that holds the method, and the full lens catalogue in [`docs/erp-lenses/_meta/_index.md`](./docs/erp-lenses/_meta/_index.md) — including [`_canonical-decisions.md`](./docs/erp-lenses/_meta/_canonical-decisions.md), the ruling where two lenses would otherwise pull against each other. |

**Why this matters for an agent picking up this codebase cold**: the
whole reason `CLAUDE.md` opens by saying the rules "used to live only in
one person's private global config, so a teammate's agent, a cloud run or
CI saw none of them" is that memory which lives only in one person's head
— or one session's own context window — is not memory at all once that
session ends. Every one of the four sources above is checked into git,
which means it survives the session, the container, and the person who
wrote it.

**This file exists only so "Memory.md" is findable by name.** Do not
start a new decision log here — add the decision to `DECISIONS.md`, where
the next agent (human or otherwise) already knows to look.
