# 119 — Container portability: already real, and already proven by a second, non-containerized deployment shape

> **Status (2026-09-30): confirmed against the now-built doc 48.** Doc 48
> (WO-48.1/48.3/48.4/48.5) shipped as a new, separate `packages/desktop-runtime`
> package — `git show --stat` on its merge commit confirms **zero files under
> `apps/api/` were touched**. This document's central claim ("unmodified
> `apps/api`... no environment-specific code branch... distinguishing
> container from desktop install") holds exactly as written, now verified
> against the real build rather than the doc's own prior description. Doc 94
> remains a real coverage note (Dockerfiles + five compose files exist,
> `docs/implementation/README.md`). No code or schema change from this
> document, as its own "Acceptance" already states.

"Standardize deployments using containerized architecture to ensure
applications can migrate seamlessly across managed cloud providers or
self-hosted bare-metal environments without core rewrites" restates doc
94's own citation (Dockerfiles and compose files already exist at the
repository root) with one additional, stronger piece of evidence this
document adds: **doc 48's own offline desktop node is proof this
repository's core already runs without a rewrite in a completely
different environment class than its containerized cloud deployment.**

## The strongest evidence for "no core rewrites": doc 48 already exists

Doc 48 (`48-native-desktop-deployment.md`) is "a real `RETAIL-ERP.md` node
(embedded Postgres + unmodified `apps/api`)... for businesses with no
continuous connectivity at all." **Unmodified `apps/api`** is the
specific phrase worth citing here: the identical backend that runs
containerized in `docker-compose.prod.yml` also runs as a native desktop
install with an embedded database — the single strongest proof this
repository's core logic already does not assume a specific hosting
environment. No environment-specific code branch exists inside `apps/api`
distinguishing "I am running in a container" from "I am running as a
desktop install"; both read the identical environment-variable-driven
configuration (`.claude/rules/configuration.md`'s own "never hardcode an
environment value" rule already enforces this).

## What portability already covers, and the one thing it does not claim

- **Between managed cloud providers** — since `apps/api`/`apps/web` are
  ordinary containerized Node processes reading configuration from
  environment variables (never a cloud-vendor SDK hardcoded into core
  logic — `StorageDriver`'s own extension-point pattern, doc 36, is
  exactly why storage is portable across S3-compatible providers), moving
  the containers between any container-hosting provider requires no code
  change.
- **Between cloud and bare-metal** — doc 48's own desktop node already
  proves this for the most extreme case (no server at all, an embedded
  database on a single machine); `docker-compose.prod.yml` running on a
  self-hosted bare-metal server is a strictly easier case of the same
  proof.
- **What this does not claim**: portability of *data* between a hosted
  Postgres and a different database engine — this repository is
  deliberately, permanently Postgres via Prisma (`RETAIL-ERP.md`'s own
  R2/R7), and "portability" here means the *application*, not a promise
  to also run against MySQL or a NoSQL store.

## Scope lenses

Not repeated — doc 48 and doc 94 each already carry complete scope-lens
treatment for their own respective mechanisms.

## Work orders

None. This document strengthens doc 94's own coverage note with doc 48's
own stronger evidence, introducing no new mechanism.

## Acceptance

- No schema or code change — verified by citation to doc 48's own
  "unmodified `apps/api`" claim and doc 94's existing container
  infrastructure.

## Out of scope

Database-engine portability (running against something other than
Postgres) — explicitly not a goal; `RETAIL-ERP.md`'s own R2/R7 commit
this repository to Postgres permanently, and "portability" in this
document means the application layer, never the storage engine.
