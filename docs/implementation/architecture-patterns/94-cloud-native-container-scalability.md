# 94 — Docker: already real, at every deployment shape this repository ships

> **Status: verified (2026-09-26).** `apps/api/Dockerfile`,
> `apps/web/Dockerfile`, and every named `docker-compose.*.yml` file
> confirmed present at the repository root. No autoscaling exists, exactly
> as this document states honestly. No code or schema change.

"Utilize containerized environments, such as Docker, to allow modular
services to provision resources automatically based on demand spikes,
optimizing infrastructure costs" is, for the containerization half,
already true — `apps/api/Dockerfile`, `apps/web/Dockerfile`,
`docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.mail.yml`,
`docker-compose.branch.yml`, and `docker-compose.caddy.yml` all already
exist at the repository root. The "automatic provisioning based on demand
spikes" half is a distinct, larger claim (autoscaling) this document
answers honestly rather than assuming solved by the presence of
Dockerfiles alone.

## What already exists

- **Containerized `apps/api` and `apps/web`**, each with its own
  `Dockerfile`.
- **`docker-compose.prod.yml`** — the production topology.
- **`docker-compose.branch.yml`** — per-branch/per-node composition,
  consistent with `RETAIL-ERP.md`'s own node-per-branch model (doc 48's
  offline desktop node is a different, non-containerized deployment shape
  for businesses with no continuous connectivity — the two coexist by
  design, never in competition).
- **`docker-compose.mail.yml`/`docker-compose.caddy.yml`** — the
  supporting mail and reverse-proxy infrastructure, also containerized.

## The honest gap: "automatically... based on demand spikes" is not autoscaling

Docker Compose runs a fixed topology; it does not itself scale container
count in response to load the way a Kubernetes HPA or a managed
container-scaling platform would. `CLAUDE.md`'s own "Mapping a reference
architecture diagram's boxes" section already answers this precisely for
"Load Balancer": **"not applicable at today's single-process-per-node
scale. When a node needs horizontal replicas this gets a real answer in
`DECISIONS.md` before it gets an env var — never assumed into
existence."** The identical reasoning applies to autoscaling: this
repository's own architecture (`ENTERPRISE-SCALE.md`) is one process per
node, and introducing horizontal autoscaling for a single-tenant node
(doc 39's shared-hosting tier scales tenant *count*, not per-tenant
replica count) is a real infrastructure decision this document does not
make speculatively on a promotional bullet's behalf.

## Scope lenses

Not repeated — no new schema, write path, or permission; this document
cites existing infrastructure and names one honest gap rather than
introducing a new mechanism.

## Work orders

None against containerization itself — it already exists. **WO-94.1
(named future work, not built here)** — if a real, measured need for
per-node horizontal autoscaling emerges, that decision is recorded in
`DECISIONS.md` first, per `CLAUDE.md`'s own standing rule, before any
compose/orchestration change.

## Acceptance

- No schema or code change — verified by citation to the existing
  Dockerfiles and compose files.
- "Automatic provisioning based on demand spikes" is scoped honestly as
  not yet built, distinct from containerization (which is built).

## Out of scope

Adopting a container orchestrator (Kubernetes or equivalent) for
autoscaling — a real, large infrastructure commitment, not assumed here;
named as future `DECISIONS.md`-level work if a measured need ever
justifies it.
