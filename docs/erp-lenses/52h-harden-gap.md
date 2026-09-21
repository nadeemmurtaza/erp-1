# 52h harden gap

Output of the `harden:gap:52` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

No lens classifies a new table's replication data-class and direction (R2), only Product gets asked

## File

docs/erp-lenses/52-gap-no-lens-classifies-a-new-table-s-replica.md

## Kept

### The registration that either exists or gets carved around

**Question:** For every new table this feature adds that must be visible outside the node that writes it, name its dataClass (FACT/POLICY), direction (UP/DOWN), and the module/method where ReplicationRegistry.register() is called for it, or justify why the table never leaves its node.

**Citations:** replication.registry.ts:28-35 (verified verbatim); _canonical-decisions.md Ruling 8 quote verified verbatim; _conflicts.md #8 quotes verified verbatim; product-replication.listener.ts onModuleInit/register block (corrected to lines 42-48); order-replication.listener.ts:40-44 quote verified verbatim; 00a-ground-topology.md 'dormant machinery' / listener claim verified; file 18 (18-master-data-taxonomy.md) 'The propose-up path that never opens' confirmed as a distinct, Product-specific, pre-registry lens.

**Strength:** strong

### The quarantine nobody opens

**Question:** For every table this feature registers, when apply() throws or quarantines a record, name the controller route and @RequirePermission key (held by a real role in the seed) that lists and resolves ReplicationQuarantineService's open rows, or the existing screen that already covers it.

**Citations:** replication-quarantine.service.ts's quarantine()/listOpen()/resolve() confirmed to exist; grep -rn "Quarantine" apps/api/src --include='*.controller.ts' confirmed to return zero matches (no controller exposes it); order-replication.listener.ts:40-44 confirmed every incoming Order fact quarantines unconditionally today; ROLE_PERMISSION_SEED confirmed to exist in apps/api/prisma/seed.ts as the real grant mechanism.

**Strength:** solid

## Killed

## Corrections

- product-replication.listener.ts line range: file claimed 43-47 for the register() block inside onModuleInit(); actual span is 42-48 (onModuleInit opens at 42, closes at 48). Widened citation.
- 00a-ground-topology.md paraphrase 'only Product and Order producing today' loosely restated the source's actual wording 'only Product and Order have listeners' — corrected to quote the source framing directly.
- Original doneTest grep `grep -n "registry.register('<entity>'" apps/api/src/modules` omits -r and errors ('Is a directory') when run as written against a directory; verified the fix `grep -rn ...` returns the expected match. Corrected in the rewrite.

