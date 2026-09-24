# 31g generate enablement onboarding

Output of the `gen:31:enablement-onboarding` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Training, documentation and the first hundred users

## File

docs/erp-lenses/enablement-onboarding/31-enablement-onboarding.md

## Lenses

### The landing page assumes two roles

**Question:** For every role this deployment defines — not just the ones with analytics.view — what URL does a fresh login land on, and what does navFor() leave that user able to click once they get there?

**Grounding:** apps/web/src/components/admin/nav-registry.ts: landingFor() (L358-361) is a binary analytics.view -> /admin else -> /admin/stitching; navFor() (L373-387) filters ADMIN_NAV by permission-any-of and enabled module.

### Demo data has one persona

**Question:** Name the seed rows (table, id prefix, count) a trainee playing warehouse picker, area manager or internal auditor would see on first login, and what happens in the ledger when they act on one.

**Grounding:** apps/api/prisma/seed.ts demo records STO-DEMO-0001..0003 / JOB-DEMO-0001..0005 (~L2798-2860), a single tailor-facing workflow seeded once with no per-actor-family sandbox or demo tagging.

### Going live has no state

**Question:** When a branch finishes training and is switched on, what field changes, who may flip it, and what does every screen reading Location today do differently for a branch that exists but is not yet live?

**Grounding:** apps/api/prisma/schema/inventory.prisma:76-106 Location model has only isDefault/isActive (operational flags); InventoryService.defaultLocationId() at inventory.service.ts:166 is a caller that would need to respect a rollout state that does not exist.

### Permission with no explanation

**Question:** For a permission key a trainee's role meets for the first time, what text explains what it unlocks, and does every surface gating on that key read the same string or does each write its own?

**Grounding:** packages/shared/src/permissions.ts:38-43 PermissionDefinition = {key, label, category, sensitivity} — no description/helpText/docsUrl field; label is a short admin-UI string, not guidance copy.

## Absences

- No rollout/enablement state on Location or Node (only isActive/isDefault and ACTIVE/SUSPENDED, both operational, not training/go-live state)
- No per-role or per-actor-family sandbox/demo dataset; seed.ts demo rows are single-persona, permanent, and untagged for identification or wipe
- No guidance/help-text field anywhere in the permission catalogue (PermissionDefinition carries only label, a UI string) and no stated translation-key convention for guidance copy
- No training-completion or first-run-tour record on User or UserRoleAssignment to gate an onboarding walkthrough by the permission set a role actually holds

