<!-- POINTER FILE — not the source of truth, never edited to add a rule. -->

# Rules

The rules for working in this repository live in one place:
**[`CLAUDE.md`](./CLAUDE.md)** at the repository root. It is the binding
contract for every agent, developer, and automated process that touches
this codebase — the seven laws, the module-pack architecture, the full
NEWAX Engineering Operating Protocol, and the definition of done.

`CLAUDE.md` is itself the hand-written source that a generator
(`scripts/build-index.mjs`) mirrors into `AGENTS.md`, `GEMINI.md`,
`.cursor/rules/repo-index.mdc`, `.windsurfrules`, and `.clinerules` for
other tools — every one of those points back to `CLAUDE.md`, and none of
them is ever hand-edited.

**The long form** is
[`docs/implementation/00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md).

**Rules scoped to one kind of file** — UI/CSS, the design system,
performance, database migrations, security, services/error-handling,
testing, dependencies, environment configuration, and how to record an
architectural decision — live in `.claude/rules/` and load automatically
the moment an agent opens a file they govern. The complete, current list
is the table under "The rule index" in `CLAUDE.md` itself.

**This file exists only so "Rules.md" is findable by name.** If you are
looking for a rule, or adding one, `CLAUDE.md` — never this file — is
where it lives.
