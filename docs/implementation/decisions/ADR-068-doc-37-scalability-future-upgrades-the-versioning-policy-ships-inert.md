# ADR-068 — Doc 37 (scalability future upgrades): the versioning policy ships inert, `FeatureFlag` gains two fields its own sketch omitted, and the rollout threshold reuses the settlements/bank-facilities maker-checker shape rather than inventing a third

[← Decision log](../DECISIONS.md)


### Context

Doc 37 answers a software-lifecycle question none of `MULTI-SECTOR.md`,
`ENTERPRISE-SCALE.md` or `RETAIL-ERP.md` cover: how an already-running
system accepts a code change without breaking an old client or forcing an
all-or-nothing rollout. Three sub-capabilities: a version/deprecation policy
on top of the URI versioning `main.ts` already wires but has never used; a
`FeatureFlag` primitive for staged rollout; and `SDK-CONTRACT.md`, a
published contract for a pack built outside this repository. Two of the
document's own §1 bullets name `ApiClientRequestLog` (doc 34's `ApiClient`),
which does not exist in this codebase — doc 34's own README row and
ADR-037 already record that an organisation-level service account is
deliberately deferred in favor of doc 163's personal API keys.

### Options Considered

1. **Build `ApiClient`/`ApiClientRequestLog` here to unblock the `apiVersion`
   column and the "who still calls v1" report doc 37's §1 names.** Rejected
   outright — ADR-037 is a settled decision with no new evidence offered
   here to reopen it; `CLAUDE.md`'s "Preserve existing systems" rule forbids
   rebuilding a deferred capability as a side effect of an unrelated work
   order. The two pieces are named as explicitly blocked in doc 37's own
   status blockquote instead of faked against a table that does not exist.
2. **Exercise the `Deprecation`/`Sunset` header mechanism against a
   fabricated v2 route just to prove it works live.** Rejected — nothing
   has ever needed a v2, and inventing one would be exactly the
   speculative-functionality doc 38's own `CircuitBreaker` precedent avoids
   by shipping inert and unit-tested directly against the policy service.
3. **`FeatureFlag`'s threshold ("needs a second approver" on a money/
   stock-path flag) as a single extra permission check with no distinct-
   actor enforcement**, on the reasoning that no shared "maker-checker
   primitive" exists in this codebase to reuse. Investigated first,
   rejected on the evidence: `SettlementsService.approveWriteoff()`
   (`writeoffRequestedById`/`writeoffApprovedById`, refusing the same actor)
   and `BankFacilityDrawdown` (`createdById`/`approvedById`,
   `finance.facilities.approve_drawdown` seeded onto ADMIN) are both real,
   built instances of exactly this shape in this codebase already. A single
   permission check with no distinct-actor refusal would let a lone ADMIN
   holding both keys self-approve, defeating "a second approver" entirely
   the moment both permissions are seeded onto the one role every
   deployment starts with.
4. **Add `moneyOrStockPath`/`removalCriteria` to `FeatureFlag` beyond doc
   37's own Prisma sketch**, needed because the sketch names WO-37.3's own
   audit ("every flag with no stated removal criteria") and the "threshold
   nobody approves alone" lens ("if the flag gates a money- or
   stock-writing path") but gives neither a column to check against.
   Considered speculative at first read, then judged a necessary completion
   of what the document itself already asks for — the identical judgment
   call this session's own prior ADRs (e.g. ADR-063's mirrored shape) make
   routinely for an incomplete sketch.
5. **Reuse the settlements/bank-facilities maker-checker shape for
   `FeatureFlag`'s own threshold, held as pending fields on the flag itself
   (never a separate request table) given a flag has at most one risky
   change proposed at a time.** Chosen, alongside 2 and 4 above.

### Decision

**1, 2, 4, 5** — see this session's changes and doc 37's own status
blockquote for the full list. In one line: `core/versioning/`
(`ApiVersionPolicyService`, `DeprecationHeaderInterceptor`) implements the
header mechanism inert; `core/feature-flags/feature-flags.service.ts`
implements `isEnabled()` with the stated precedence, a 30s cache, and a
fail-closed default; `FeatureFlagsAdminService.proposeRollout()`/
`.approveRollout()` mirror `SettlementsService`'s own maker-checker exactly,
refusing the same actor; `platform.flags.manage`/`platform.flags
.approve_rollout` are both seeded onto ADMIN, the identical shape
`finance.settlement.approve_writeoff`/`finance.facilities
.approve_drawdown` already take, relying on the distinct-actor check rather
than withholding the permission (doc 37's own scope-lens marks "the toxic
pair" n/a for this document, ruling out the `org.access.grant`-style
withhold-from-ADMIN shape instead); `SDK-CONTRACT.md` and
`example-hello-world-pack` (registered under a new, non-`core` `'example'`
`PackName`) are built as doc 37 §3/WO-37.4 ask. The `apiVersion` column and
the v1-usage report stay unbuilt, named in doc 37's own status blockquote.

### Reasoning

- **Evidence over the task's own tentative suggestion.** The initial plan
  assumed no reusable dual-approval shape existed in this codebase; a
  direct search found two (settlements, bank facilities) already built and
  in production use for exactly this kind of threshold. Following the
  evidence rather than the untested assumption is what "if one exists,
  reuse it instead of inventing a second one" actually asks for.
- **Fails closed, not merely gated.** A flag lookup failure, and a flag row
  that does not exist, both resolve to `false` — the same "never silently
  fails open by accident for a money-adjacent flag" rule doc 37's own
  "failure path" lens states, and the same posture `SettingsService`
  already takes for configuration reads generally.
- **The cache's own honesty.** A 30s TTL is stated as a real trade-off
  (an ordinary rollout edit takes up to 30s to reach every process), not
  hidden — `killSwitch=true` additionally invalidates its own process's
  cache entry synchronously, so the process that flips it during an
  incident sees the effect immediately, while every other process still
  catches up within the stated window.
- **A demonstration pack proves the seam, not a fixed test.** Registering
  `example-hello-world-pack` under a genuine new `PackName` (`'example'`,
  never `'core'`) means `check-module-boundaries.mjs`'s DIRECTION rule
  actually constrains it the same way it would a real third-party sector
  pack — a pack registered under `'core'` would not have been a real test
  of the boundary doc 37 §3 asks to prove.

### Consequences

- The `apiVersion` column and the "who still calls v1" report remain a
  real, named gap until doc 34 ships — tracked in doc 37's status
  blockquote and this ADR, not silently dropped.
- A deployment with only one ADMIN account cannot complete a 100%-rollout
  or kill-switch-clear transition on a money/stock-path flag at all (the
  distinct-actor refusal has no second person to approve) — the same
  honest limitation settlements/bank-facilities already carry for their own
  thresholds, not a new one this document introduces.
- `docs/.env*.example`'s `# Available:` lines and `module-packs.ts`'s
  `PackName` union both now carry `example-hello-world-pack`/`'example'`
  permanently, as a standing, lint-checked proof rather than a one-time
  manual confirmation.
- Doc 37's own status blockquote and `docs/implementation/README.md`'s row
  state exactly what shipped and what is still blocked, per this session's
  own standing documentation discipline.

### Status
**Accepted.**
