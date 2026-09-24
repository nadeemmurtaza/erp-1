# 124 — Infrastructure as Code: version-controlled scripts already exist; declarative provisioning does not

"Treat server provisioning, networking, and deployment pipelines as
version-controlled code. This allows the entire system state to be
instantly rebuilt, cloned, or rolled back in an alternate data center
during a catastrophic failure" is partially true today and partially a
real, honestly-named gap.

## What already exists, version-controlled, in this repository

- **`deploy/`** — `backup.sh`, `disk-alert.sh`, `swarm-init.sh`, and a
  `systemd/` directory of unit files, all committed to this repository,
  version-controlled exactly as any application code is.
- **The Docker Compose files** (doc 94/119's own citation) — the
  application's own runtime topology, declarative and version-controlled.
- **Doc 38's own disaster-recovery framing** — "a quarterly game-day:
  actually failing over to a restored backup in a non-production
  environment" is this repository's own already-specified rehearsal
  discipline for exactly the "catastrophic failure" scenario this bullet
  names, via `backup.sh`'s own restore-test path (doc 38, doc 90).

## The honest gap: no declarative infrastructure-provisioning tool

Shell scripts and systemd unit files are version-controlled, but they are
not **declarative infrastructure as code** in the sense the bullet's own
"instantly rebuilt... in an alternate data center" implies — no
Terraform, Pulumi, or equivalent tool exists in this repository to
provision the underlying compute, networking, or DNS from a stored,
diffable state. Doc 39's own `ProvisioningService` (this session's own
earlier work) is the closest thing to this for *tenant* provisioning
(a new tenant database, in minutes, per doc 51) — but it provisions
application-level tenancy inside an already-running server, not the
server/network/data-center infrastructure itself.

## Scope lenses

Not applicable in full — this document names an honest gap rather than
building a mechanism; doc 39's own scope lenses already cover the
tenant-provisioning half that does exist.

## Work orders

**WO-124.1 (named future work, not built here)** — adopting a declarative
infrastructure tool (Terraform or equivalent) for the underlying
compute/network layer is a real, significant infrastructure investment;
per `CLAUDE.md`'s own standing rule for exactly this class of decision,
it is recorded in `DECISIONS.md` first, with a stated reason (a real
multi-data-center failover requirement, not a promotional bullet), before
any tooling is adopted.

## Acceptance

- No schema or code change from this document.
- The distinction between "version-controlled deployment scripts" (real,
  today) and "declarative, diffable infrastructure provisioning" (not
  built) is stated honestly in any client-facing description drawing on
  this document.

## Out of scope

Adopting Terraform/Pulumi or standing up a second data center — both
real, large commitments named above as future `DECISIONS.md`-level work,
not undertaken speculatively here.
