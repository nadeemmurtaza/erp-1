# 21g generate omnichannel parity

Output of the `gen:21:omnichannel-parity` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Surfaces and omnichannel parity

## File

docs/erp-lenses/omnichannel-parity/21-omnichannel-parity.md

## Lenses

### The gate checked once, not per action

**Question:** For this capability, name the exact check that authorizes it on each surface it reaches, and state whether that surface re-checks a specific permission at the point of the action or relies on a single coarser check made earlier (e.g. at login).

**Grounding:** apps/web/src/components/admin/nav-registry.ts navFor() (per-item permission re-check every render) vs apps/pos/src/lib/auth-client.ts:64 (single fixed 'pos.operate' check at login only) and apps/pos/src/app/till/page.tsx, returns/page.tsx (no further check).

### The registry only one surface has

**Question:** Name the artifact on each of admin, storefront, customer portal, POS and the API that a reviewer can grep to confirm this capability is reachable there — or, where intentionally absent, where that decision is written down.

**Grounding:** nav-registry.ts ADMIN_NAV + navFor() vs apps/pos/src/app/ (8 hand-linked route folders, no registry) vs storefront's four separate nav files (customer-nav.tsx, bottom-nav.tsx, mobile-nav.tsx, dashboard-nav.tsx) with no shared filter; TradingPartner/Node have no nav concept at all.

### The principal with no permission to check

**Question:** For each non-User principal that can reach this capability — PosTerminal, TradingPartner, Node — name what authorizes the specific action, since PermissionsResolverService.resolveForUser() and PermissionsGuard never run for a request carrying none of those.

**Grounding:** JwtStrategy.validate (jwt.strategy.ts:39) is the only path into PermissionsResolverService; PosTerminal (pos.prisma:27, deviceKeyHash), TradingPartner (trading-partners.prisma:33, inboundApiKeyHash), Node (organization.prisma:142, inboundApiKeyHash) each authenticate via separate ad hoc key hashes and hold none of the 50 keys in packages/shared/src/permissions.ts.

## Absences

- A partner portal surface: franchisee has no model, login, permission key or UI — partner access today is only the machine-to-machine TradingPartner API.
- A native mobile app: 'mobile' is only the storefront's responsive nav (mobile-nav.tsx, bottom-nav.tsx), not a separate deployable surface with its own reachability artifact.
- A shared reachability registry outside admin: storefront, POS and the API have no navFor()-equivalent to grep for capability presence/absence.
- A permission model for non-User principals: PosTerminal, TradingPartner and Node each hold an ad hoc key hash with no shared principal type and no permission keys of their own.

