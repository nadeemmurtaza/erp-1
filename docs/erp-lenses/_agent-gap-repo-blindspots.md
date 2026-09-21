# Gap repo blindspots

Output of the `gap:repo-blindspots` agent (Gaps phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Angle

Read the catalogue and CLAUDE.md feature-scope section against this repository's own documented scars: ENTERPRISE-SCALE.md's gap table, RETAIL-ERP.md's rulings and roadmap, and the half-built code those two cite (replication engine, node topology, module packs) — looking for scope questions this repo has already learned the hard way that no lens yet asks.

## Verdict

One real, well-evidenced gap survived verification; every other candidate I traced (branch-scoped reads, pack absence, sector-conditional risk, the R9 quarantine rule, intercompany elimination, GenAI-never-computes, Solo-invisibility/upgrade, seedPermissions-vs-seedRoles, and an apparent Br1-vs-RetailBrand contradiction) turned out to already be covered by a named lens, and I wrote why for each rather than asserting it. Full record written to docs/erp-lenses/_gap-repo-blindspots.md.

## Gaps

### No lens classifies a new table's replication data-class and direction (R2), only Product gets asked

**Why:** RETAIL-ERP.md R2 ("facts flow up, policy flows down, ledgers merge, nothing sideways") is enforced mechanically by replication.registry.ts, which throws at boot on a wrong-direction registration (cited verbatim in _canonical-decisions.md Ruling 8 and _conflicts.md #8). The catalogue only asks this question once, narrowly, for Product in file 18 ("The propose-up path that never opens"). No lens asks the general form for every new table a Chain/Organization feature adds: name its dataClass (FACT/POLICY), its direction (UP/DOWN), and the registered listener that carries it -- and confirm that listener actually exists, since 00a-ground-topology.md notes only two entities (catalog product, orders) have one today, calling replication otherwise 'dormant machinery'. Without this question, a feature either (a) hits the registry's throw under deadline and gets an ad-hoc per-entity exception carved into replication.registry.ts -- which _conflicts.md #8 predicts verbatim as 'invisible six months later... the thing the next conflict... will cite as precedent' -- or (b) ships a correctly-classified table with no listener wired, so it silently never leaves its node (a brand-tier report reading zero rows from every branch, with nothing in the diff to say so). Severity: significant, becoming blocking once Tranche 3 (replication) and Tranche 5 (chain operations) land and features start adding tables that must cross node boundaries other than Product and Order.

**Severity:** significant

