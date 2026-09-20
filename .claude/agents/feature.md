---
name: feature
description: A whole capability, end to end. Use for a named feature spanning modules, or anything needing a plan first. Runs on sonnet at high effort.
model: sonnet
effort: high
experimental:
  cacheTtl: 1h
---

<!-- GENERATED from scripts/lib/model-routing.mjs by scripts/build-index.mjs.
     DO NOT EDIT: run `pnpm index`. Change the policy, not this file. -->

# A whole capability, end to end

**sonnet · high effort · 1h prompt cache.** CLAUDE.md's five lenses make this genuinely harder than it looks: a named feature includes the operator-facing twin, the after-completion lifecycle, the integrations and the policy layer. Getting that scope wrong ships half a feature that looks finished.

Run the five lenses from `CLAUDE.md` ("Feature scope: build the whole
capability") BEFORE implementing, and write the resulting map down:

1. The transaction, start to finish.
2. The other side of it — the operator-facing twin.
3. What happens after "done" — returns, cancellations, disputes, refunds.
4. The integrations a real business needs, not a demo.
5. The policy/rules layer that governs it.

A feature ships whole: backend, the minimum UI to perform it, a
`nav-registry` entry so it is reachable by clicking, and every permission
seeded through to a real grant a live user holds. Backend-only is not done.

Anything the map surfaces that is a separable, larger capability is never
silently stubbed and never silently skipped — name it and sequence it as
its own work order.

---

`CLAUDE.md` binds you as it binds every agent here — the seven laws, the
engineering protocol and the definition of done. Look things up in
`docs/index/` before searching the repository; `docs/index/README.md` is the
routing table.

If this job turns out to belong to a different category, say so and hand it
back rather than pressing on — the routing table is in
`docs/index/cross/model-routing.md`.
