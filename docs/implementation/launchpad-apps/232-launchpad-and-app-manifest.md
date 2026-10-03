# 232 — The launchpad and the first-party app manifest

> **Status: Planned.** Cross-cutting **core** capability. Presentation layer
> only: it does not change module independence, `MODULES`, PBAC, or the
> third-party app program (docs 184–195).

## 1. Objective

One screen after login that shows **the apps this person can use**, grouped
the way a business thinks (Sales, Inventory, Mail, Auction…), not the way the
code is organised (`orders`, `cart`, `pricing`…). Law 3: it should feel like
there are only a few features. Law 7: overview first, detail on click.

## 2. Existing state (inspected)

* `apps/api/src/modules/module-packs.ts` already classifies every module
  `core` or as a sector pack, and `FEATURE_MODULES` is the registry the
  `MODULES` allowlist is matched against.
* `MULTI-SECTOR.md` already rules that business models (B2B/B2C/…) **cut across
  sectors** — so audience cannot be a folder; it must be a tag.
* The admin shell has a nav registry and a card registry
  (`apps/web/src/components/admin/…`), but **no launchpad, app manifest or app
  grouping** exists (searched docs and code).
* Docs 184–195 define **third-party directory apps** (remote services,
  `AppListing`/`AppVersion` in the control plane). Different thing; §7.
* Gap named in `MULTI-SECTOR.md`: the web app historically could not see which
  modules are enabled. The launchpad must resolve this **server-side**.

## 3. The manifest

A **`LaunchpadApp`** is a typed constant in code, shared by api and web
(`packages/shared`), not a database row. Reason: it changes with releases, is
reviewed like code, and "static manifest + per-tenant setting" keeps doors open
without a migration per new app (Flexibility).

```ts
interface LaunchpadApp {
  key: string;                 // 'mail', 'auction' — stable, unique
  nameKey: string;             // i18n key, never a literal (Law 1)
  descriptionKey: string;
  iconKey: string;             // from the design system's icon set
  tier: 'CORE' | 'INDUSTRY';
  sectors: string[];           // [] for core; ['hospitality'] etc.
  audiences: ('B2B' | 'B2C' | 'C2C' | 'INTERNAL')[];
  modules: { key: string; required: boolean }[]; // modules it presents
  entries: AppNavEntry[];      // nav-registry entries the tile opens
  anyOfPermissions: string[];  // visible if the user holds ≥1
  stage: 'STABLE' | 'BETA' | 'RESERVED';
  licenseKey?: string;         // doc 211 hook (§8)
  sortOrder: number;
}
```

**Rules**
1. **Presentation, not coupling.** The manifest lists modules to *show*. It
   adds no import between them. Modules still talk through domain events and
   `KNOWN_MODULE_COUPLINGS`. A manifest that forces one module to call another
   is rejected in review and by `pnpm lint` (new check, §10).
2. **A tile is shown only when it can work**: every `required` module is in
   `MODULES`, the tenant has not disabled the app (§6), the license allows it
   (§8), **and** the user holds at least one entry's permission. Zero
   reachable entries → the tile is absent, never greyed-out with a dead click
   (design law: layout closes over absent permissions and modules).
3. **Optional modules degrade the app, never hide it.** Missing optional
   module → its entries disappear; the app still opens.
4. **Resolution is server-side.** `GET /launchpad` returns the resolved tile
   list for the caller; the client never decides what it may see.
5. Nothing is deleted to make it calm (Law 2): a rarely-used capability moves
   one level down into its app's own menu.

## 4. Tags: tier, sector, audience — three facets, not a tree

| Facet | Values | Cardinality | Why a tag |
|---|---|---|---|
| **Tier** | `CORE`, `INDUSTRY` | exactly one | core apps ship to everyone; industry apps follow `MODULES` |
| **Sector** | `hospitality`, `housing-society`, `apparel`, … | zero or more | an industry app belongs to a sector pack; core has none |
| **Audience** | `B2B`, `B2C`, `C2C`, `INTERNAL` | one or more | Mail is internal and B2B; Auction can be all three |

The launchpad's default view is **My apps** (pinned and recently used). Filters
by tier/sector/audience are one level down — never three nested menus.

**C2C is a reserved tag, not a feature.** B2B and B2C are mostly pricing,
accounts and checkout, which exist. C2C means *peers trading with each other*
and needs identity, reputation, escrow and dispute handling that the platform
does not have (doc 165 is the nearest, far from sufficient). An app may carry
`C2C` only with `stage: 'RESERVED'` until those exist; the launchpad shows no
C2C tile today.

## 5. What the user sees

* A grid of tiles (icon + name + one line), pinned first, then the rest by
  `sortOrder`. At 280 px it is a single-column list; at 1536 px it fills the
  width with no dead space (Law 4).
* Badge only where it carries information: `Beta`, `External` (third-party),
  an unread count from the app's own event feed. No decorative badges.
* Empty state (user holds nothing): one sentence naming who grants access,
  never a blank page. Loading skeleton; error with retry.
* The command palette (existing) searches apps and their entries.

## 6. Per-tenant control

* **`MODULES`** stays the source of truth for **whether code is present**
  (build/boot-time, `MULTI-SECTOR.md`).
* **`AppEnablement`** (a `Setting` list, not a table) lets an admin turn an app
  **off for the tenant** even when its modules are present (e.g. hide Auction
  from a B2B-only client). Changes are audited with old and new value and need
  `launchpad.manage`.
* Turning an app off hides its tile and entries; it does **not** delete data
  and does not stop events other modules depend on (a hidden app is not a
  removed module).

## 7. Third-party (directory) apps on the same screen

When docs 184–195 are built, an installed directory app (doc 187) appears as a
tile marked **External**, resolved from that tenant's installations, opening
its configured entry. **Nothing about their trust model changes**: the
launchpad renders a link and a status; it never loads app code in-process
(doc 184 §2). Until then the launchpad shows first-party apps only.

## 8. Licensing hook (doc 211)

Doc 211 keeps cloud (subscription) and offline (license) strictly separate. An
app is the natural unit to license: `licenseKey` maps an app to a plan entitlement.
Rule: **the launchpad never mixes the two products** — it asks one
`EntitlementService` answer per app ("allowed / not allowed"), whichever
product the deployment is. No entitlement service yet → every app is allowed
(the current behaviour), so the hook costs nothing now.

## 9. Resilience and failure modes

* Launchpad resolution failure → the user still reaches every app through the
  existing nav (the launchpad is a convenience, not the only path; no dead end).
* A manifest naming an unknown module key fails **at build/boot validation**, not
  at click time.
* Cache: the resolved list is cached per `(userId, permissionsVersion,
  modulesVersion)`, invalidated when roles, `MODULES` or `AppEnablement`
  change. TTL 60 s floor so a missed invalidation self-heals.

## 10. Verification additions

A `scripts/check-launchpad.mjs` (new, runs in `pnpm lint`): every manifest key
unique; every `modules[].key` exists in `FEATURE_MODULES`; every `entries[]`
exists in the nav registry; every `anyOfPermissions` exists in
`PERMISSION_CATALOG`; no label is a literal; an app with `C2C` has
`stage: 'RESERVED'`. With `--self-test`, like the other checkers.

## 11. Scope lenses

**The actor** — every `User`; no new actor. **Principal with no permission key** — n/a: `GET /launchpad` needs only authentication, and returns only what permissions already allow.
**The grant that ends itself** — tile visibility derives from live permissions, so it ends with the grant; no stored copy.
**Whose rows / columns** — no business rows; app list is per user.
**The threshold nobody approves alone** — disabling an app tenant-wide needs `launchpad.manage`; for licensed apps a second admin confirms (blast radius: hides a workflow from everyone).
**The toxic pair** — n/a: `launchpad.manage` grants no data access.
**Authority and blast radius** — audit row with old/new `AppEnablement`.
**Audience is a capability** — n/a: sends no messages.
**Request or record** — n/a. **Movement with no address / money / posting / period / legal entity** — n/a: no stock, cash or ledger.
**Four hours down** — nav still works (§9).
**Three silhouettes** — Solo sees a handful of tiles; a group sees filters; `tier/sector/audience` exist from the first release.
**The absent collaborator** — module missing → tile hidden or degraded (§3); no entitlement service → all allowed.
**The second copy of the write** — `AppEnablement` change is idempotent by key.
**The hundred-thousandth row** — n/a: no growing table; the list is tens of rows, cached.
**The adoption test** — keys are stable slugs, not generated.
**Reversal / undo / version / erasure** — re-enable restores everything (nothing deleted); manifest is versioned by release; no personal data held.
**Failure path** — resolution error logged and falls back to nav.
**Dry run** — `check-launchpad` validates without a server.
**Click the number** — unread counts link to the filtered list.

## 12. Acceptance criteria

1. A user holding no permission in an app does not see its tile (test over a seeded role matrix).
2. Removing a required module from `MODULES` hides the app; removing an optional one degrades it.
3. `check-launchpad.mjs` fails on a manifest naming a missing module, entry or permission (self-test).
4. `AppEnablement` off hides the app for every user within 60 s, and re-enabling restores it with no data loss.
5. The launchpad adds no import between modules (module-boundary check stays green).
6. At 280 px the launchpad has no horizontal scroll; at 1536 px no empty band.

## 13. Permissions

`launchpad.manage` (enable/disable apps) — seeded to ADMIN. Everything else
reuses existing keys (an app only *shows* what they already guard).

## 14. Work orders

232.1 manifest type + `check-launchpad` · 232.2 manifests for existing apps ·
232.3 `GET /launchpad` resolver + cache · 232.4 launchpad screen + palette
search · 232.5 `AppEnablement` admin + audit · 232.6 entitlement hook ·
232.7 directory-app tiles (after docs 184–195).
