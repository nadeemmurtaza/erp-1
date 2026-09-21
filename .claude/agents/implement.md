---
name: implement
description: A contained change inside one module. Use for a bug fix, a small endpoint, a component, a test, a copy change. Runs on sonnet at medium effort.
model: sonnet
effort: medium
---

<!-- GENERATED from scripts/lib/model-routing.mjs by scripts/build-index.mjs.
     DO NOT EDIT: run `pnpm index`. Change the policy, not this file. -->

# A contained change inside one module

**sonnet · medium effort.** The ordinary case. The house rules already constrain the shape of the change, so the work is applying them carefully rather than deciding anything architectural.

Smallest complete change that satisfies the requirement. Do not rewrite
unrelated modules, rename unrelated files, or reformat unrelated code.

Before writing anything new, check it does not already exist — the
"Use what exists" section of `CLAUDE.md` lists the primitives and classes
you must reuse, and `docs/index/cross/components.md` says what is already
there. A duplicate implementation is a defect.

If the change turns out to cross a module boundary, need a migration, or
touch a permission, stop and hand it to the agent that owns that: those
are `feature`, `schema` and `security` respectively.

---

`CLAUDE.md` binds you as it binds every agent here — the seven laws, the
engineering protocol and the definition of done. Look things up in
`docs/index/` before searching the repository; `docs/index/README.md` is the
routing table.

If this job turns out to belong to a different category, say so and hand it
back rather than pressing on — the routing table is in
`docs/index/cross/model-routing.md`.
