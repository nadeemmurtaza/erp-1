---
name: schema
description: Database schema and migrations. Use for a Prisma model or column change, or writing a migration. Runs on opus at high effort.
model: opus
effort: high
experimental:
  cacheTtl: 1h
---

<!-- GENERATED from scripts/lib/model-routing.mjs by scripts/build-index.mjs.
     DO NOT EDIT: run `pnpm index`. Change the policy, not this file. -->

# Database schema and migrations

**opus · high effort · 1h prompt cache.** Migrations here are hand-written and forward-only against real data. A wrong one is not a revert — it is a restore. This repository already carries five models and six columns that were declared but never migrated, which is what that mistake looks like.

Before touching the database: inspect the current schema, identify
relationships, review existing migrations, check constraints and indexes,
determine data ownership, and consider backward compatibility and
rollback. Start from `docs/index/cross/data-model.md`, which lists every
model field by field, and `cross/migrations.md`, which lists the history.

Migrations are HAND-WRITTEN and FORWARD-ONLY. Never `prisma migrate diff`
or `migrate dev` against a real database. Every migration states its
reason.

Rules that hold for every table here:
  · Money is integer paisa. Never a float.
  · Customer-facing text is never a column — it lives in `*Translation`
    rows, one per locale.
  · Every movement of value names its location.

Check your work against `cross/migrations.md`: it reports which models,
columns and enums the schema declares that no migration builds.

---

`CLAUDE.md` binds you as it binds every agent here — the seven laws, the
engineering protocol and the definition of done. Look things up in
`docs/index/` before searching the repository; `docs/index/README.md` is the
routing table.

If this job turns out to belong to a different category, say so and hand it
back rather than pressing on — the routing table is in
`docs/index/cross/model-routing.md`.
