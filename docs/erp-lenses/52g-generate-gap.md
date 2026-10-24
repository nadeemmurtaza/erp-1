# 52g generate gap

Output of the `gen:gap:52` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Replication data-class/direction classification for every new cross-node table (R2), generalizing beyond Product

## File

docs/erp-lenses/52-gap-no-lens-classifies-a-new-table-s-replica.md

## Lenses

### The registration that either exists or gets carved around

**Question:** For every new table this feature adds that must be visible outside the node that writes it, name its dataClass (FACT or POLICY), its direction (UP or DOWN), and the module/method where ReplicationRegistry.register() is called for it -- or state that the table never leaves its node and why that is correct at Organization scale.

**Grounding:** replication.registry.ts:28-35 (throw-at-registration guard); _canonical-decisions.md Ruling 8; _conflicts.md #8 ('invisible six months later... cite as precedent'); product-replication.listener.ts:43-47 and order-replication.listener.ts:37-44 (the only two registrations that exist today); 00a-ground-topology.md:54 ('dormant machinery')

## Absences

- A build-time or lint-time check that a Prisma model documented as chain-visible has a matching ReplicationRegistry.register() call -- today the only enforcement is the registry's runtime throw at boot, and a table with no register() call at all fails silently rather than loudly.

