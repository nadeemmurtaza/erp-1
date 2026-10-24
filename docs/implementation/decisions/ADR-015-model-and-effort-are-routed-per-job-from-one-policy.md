# ADR-015 — Model and effort are routed per job, from one policy

[← Decision log](../DECISIONS.md)


### Context
Work in this repository ranges from "which file is this in" to "does this
migration lose data". Running all of it at one model and one effort level is
either wasteful or careless, depending which level is chosen.

### Options Considered
- A skill that instructs the model to pick its own level.
- A hook that sets the model based on the prompt.
- Subagent definitions that pin `model` and `effort` per job.

### Decision
**Subagent definitions.** `scripts/lib/model-routing.mjs` is the single policy;
the eight definitions in `.claude/agents/`, the page in
`docs/index/cross/model-routing.md`, the advisory hook and the table in every
agent-instruction file are all generated from it.

### Reasoning
A skill is instructions loaded into the current context and cannot change the
model; a hook is documented as unable to set model or effort. A subagent
definition carries both and is delegated to automatically by matching its
description, which is the only mechanism that actually selects per job with
nobody choosing. The default direction is **down**: nothing has to justify
staying at `sonnet`/`medium`, going above it does. The expensive models are
spent where being wrong is a breach or a restore — permissions, money,
migrations, module boundaries — and nothing extra is spent on a lookup, which is
the most frequent operation.

### Consequences
- The main session's own model and effort remain manual (`/model`, `/effort`);
  the hook advises and says that it is advising.
- Cache TTL follows effort rather than frequency: a cache read refreshes the
  entry for free, so fast agents keep the cheaper 5-minute default and only
  long-running ones take the 1-hour TTL's doubled write price.
- Other tools have their own model pickers, so for them the table is guidance,
  not configuration. That limit is stated rather than papered over.

### Status
Accepted.
