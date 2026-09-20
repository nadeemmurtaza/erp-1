# 32h. Hardening record: What the feature exposes to automation (automation & AI surface)

Adversarial review of [32-automation-and-ai-surface.md](32-automation-and-ai-surface.md) by the `harden:32:automation-and-ai-surface` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The machine caller's own scope  — strong

**Question:** For this feature's non-human caller, which exact PermissionKey values does it carry and where is that list checked?

**Verified against:** TradingPartnerPortalController @Public with no @RequirePermission; PermissionsGuard.canActivate short-circuits true with no required list; PosTerminal.deviceKeyHash and Node.inboundApiKeyHash confirmed in Prisma schema

### Quota has no owner  — solid

**Question:** What per-partner requests-per-minute and rows-per-call ceiling applies on top of the global 300/60s ThrottlerGuard, and where is it configured?

**Verified against:** app.module.ts ThrottlerModule/ThrottlerGuard (300/60s, IP-based, global APP_GUARD) and auth.controller.ts @Throttle(CREDENTIAL_THROTTLE) confirmed to exist, correcting the original 'no throttling exists' claim; TradingPartnerPortalController.stock's uncapped skus list and Setting (core.prisma:153) having no per-partner quota column confirmed

### Narrate, never post  — strong

**Question:** Name the exact downstream write a generative model's output must never reach directly, and which deterministic function still owns it.

**Verified against:** AccountingService.postEntry() sole callers confirmed as PostingRulesSubscriber and FiscalPeriodsService.closeFiscalYear(); JournalEntry has no postedByUserId and defaults to POSTED; no AI/draft field anywhere in schema or permissions.ts

## Killed (0)

_Nothing was killed._


## Citations corrected (3)

- Claimed 'No throttling exists anywhere in this codebase' (main.ts registers no ThrottlerModule). Actual: apps/api/src/app.module.ts registers ThrottlerModule.forRoot({throttlers:[{ttl:60_000,limit:300}]}) and wires ThrottlerGuard as a global APP_GUARD; auth.controller.ts uses @Throttle(CREDENTIAL_THROTTLE) on 4 routes. Rewrote the 'Quota has no owner' lens's why/example/doneTest/breaksWithout around the real gap: no quota scoped to caller business identity vs. the existing IP-based global limiter.
- Claimed weightedAverageCost() computed 'in purchasing.service.ts:386'. Actual: the call site is line 384; the function itself is imported from @newax/shared, not defined in purchasing.service.ts. Corrected citation to line 384 and clarified it's a call site, not a definition.
- The 'Not modelled yet' bullet claiming no ThrottlerModule/@Throttle decorator exist was factually wrong for the same reason as the first correction; rewritten to state that global IP-based throttling exists but no identity-scoped (per-partner/device/key) quota does.
