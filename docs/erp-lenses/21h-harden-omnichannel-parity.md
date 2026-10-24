# 21h. Hardening record: Surfaces and omnichannel parity

Adversarial review of [21-omnichannel-parity.md](21-omnichannel-parity.md) by the `harden:21:omnichannel-parity` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The gate checked once, not per action  — strong

**Question:** Name the exact check that authorizes this capability on each surface, and state whether it re-checks a specific permission at the point of action or relies on a single coarser check made earlier.

**Verified against:** apps/pos/src/lib/auth-client.ts:64 (pos.operate login check); nav-registry.ts navFor() per-render filter; confirmed no action-level check in till/page.tsx or returns/page.tsx

### The registry only one surface has  — strong

**Question:** Name the artifact on each surface (admin, storefront, customer portal, POS, API) a reviewer can grep to confirm reachability, or where an intentional absence is documented.

**Verified against:** ADMIN_NAV/navFor() as the only reachability table; POS's 8 hand-linked route folders; storefront's 4 separate unshared nav files

### The principal with no permission to check  — strong

**Question:** For each non-User principal (PosTerminal, TradingPartner, Node) that can reach this capability, name what authorizes the specific action.

**Verified against:** jwt.strategy.ts:39 resolveForUser as sole entry point; pos.prisma:27/39, trading-partners.prisma:33/47, organization.prisma:142/158 confirmed exact; no guard/strategy file references these principals

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None required — all citations (nav-registry.ts permissions filtering, auth-client.ts:64, jwt.strategy.ts:39, pos.prisma:27/39, trading-partners.prisma:33/47, organization.prisma:142/158, PERMISSION_CATALOG's 50 keys) were opened and confirmed exact.

## Not modelled in this repo today

- All three lenses grounded, distinct from the 35 pre-existing lenses, and falsifiable by a named grep; no replacement lens was needed since nothing was killed
