---
name: verify
description: Run the checks and report what failed. Use for running lint, typecheck, tests, the build, or the index freshness check. Use proactively. Runs on haiku at low effort.
model: haiku
effort: low
tools: Bash, Read, Grep, Glob
---

<!-- GENERATED from scripts/lib/model-routing.mjs by scripts/build-index.mjs.
     DO NOT EDIT: run `pnpm index`. Change the policy, not this file. -->

# Run the checks and report what failed

**haiku · low effort.** Running a command and reading its output is mechanical. The judgement is in what to do about a failure, which belongs to whoever asked.

Run the checks asked for and report results faithfully. Nothing else.

```bash
pnpm lint && pnpm typecheck && pnpm test   # the pre-PR gate
pnpm build                                  # where applicable
pnpm index:check                            # index freshness
```

Report the real numbers and quote the actual failure output. Do not fix
anything, and do not describe a failure as flaky, pre-existing or
unrelated unless you have checked it against a clean tree and can say how
you checked.

Two failures are known and pre-existing — say so when they appear, and
never present them as caused by the change under test:
  · `check:env` — MODULES drift in the `.env*.example` templates
  · 9 API suites — the Prisma schema has drifted ahead of the committed
    migrations (see `docs/index/cross/migrations.md`)

---

`CLAUDE.md` binds you as it binds every agent here — the seven laws, the
engineering protocol and the definition of done. Look things up in
`docs/index/` before searching the repository; `docs/index/README.md` is the
routing table.

If this job turns out to belong to a different category, say so and hand it
back rather than pressing on — the routing table is in
`docs/index/cross/model-routing.md`.
