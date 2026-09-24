# 31h. Hardening record: Training, documentation and the first hundred users

Adversarial review of [31-enablement-onboarding.md](./31-enablement-onboarding.md) by the `harden:31:enablement-onboarding` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (4)

### The landing page assumes two roles  — strong

**Question:** For every role this deployment defines, what URL does a fresh login land on and what can navFor() leave them able to click?

**Verified against:** landingFor() nav-registry.ts:358-360 (verified, two-branch on analytics.view), navFor() L373-387 (verified, permission+module filter)

### Demo data has one persona  — solid

**Question:** Name the seed rows a trainee playing picker/area-manager/auditor would see on first login and what happens in the ledger when they act on one.

**Verified against:** seed.ts STO-DEMO-0001..0003 / JOB-DEMO-0001..0005, L2798-2860 (verified, single stitching persona, no other actor-family data)

### Going live has no state  — strong

**Question:** When a branch goes live, what field changes, who may flip it, and what does every Location reader do differently for a not-yet-live branch?

**Verified against:** Location model inventory.prisma:76-113 (line range corrected, fields isDefault/isActive confirmed), AccountingService.postEntry() as sole ledger writer confirmed

### Permission with no explanation  — solid

**Question:** For a permission a trainee's role meets for the first time, what text explains it, and does every gating surface read the same string?

**Verified against:** PermissionDefinition permissions.ts:38-43 (verified, no description/helpText/docsUrl); checked PermissionGroup.description (L248-252) as a possible counter-claim — it describes a group, not a single permission, so the gap holds; i18n dirs (apps/web/src/i18n, apps/mobile/src/i18n) verified to exist

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- Location model cited as inventory.prisma:76-106; actual model spans 76-113 (cited range stopped short of the closing brace and @@index lines). Fields relied on (isDefault L100, isActive L101) are within either range, so the lens itself was not affected — only the line range was corrected in the file.
