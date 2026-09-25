# 12 - Extractor & Sync Script Specification

> **Status: shipped (2026-09-25), WO-12.1–12.7.** All seven phases below are
> built in `scripts/sync-client.mjs` and verified against a real local test
> fixture (a bare git repo standing in for a client's remote) — a full
> upgrade run and a fresh (`--repo=new`) delivery, `prisma generate` and
> `tsc --noEmit` both actually invoked and passing, `--confirm-push`'s
> absence proven to push nothing (the target's `git log` byte-identical
> before and after), and `--confirm-push` proven to push for real against
> the same fixture. Run `node scripts/sync-client.mjs --help` for the
> current flag list. Real-repository findings this spec's own text did not
> anticipate, each handled in the script and explained in its own comments:
>
> - **Real file paths already match this spec exactly** — `module-packs.ts`
>   and `modules.registry.ts` both exist at the paths named above, with no
>   discrepancy to resolve.
> - **The Prisma schema is not modular within the `core` pack.** `core.prisma`'s
>   `User` model carries real, two-sided relations into nearly every
>   `pack:'core'` module (payroll, marketing, loyalty, giftcards, reviews,
>   wishlist, content, and more), so "compile a minimized schema per
>   requested module" is not achievable at that grain — confirmed
>   empirically (a `catalog,cart`-only attempt produced 79 distinct
>   unresolved model types). The real, working prunable boundary is the
>   **sector pack** (`core` vs. `apparel` vs. a future pack), matching
>   `scripts/check-module-boundaries.mjs`'s own `checkPrismaBoundaries()`,
>   which already treats a same-pack relation as no violation at all. The
>   script therefore ships every `pack:'core'` schema file whenever any
>   `core` module is requested (always true, since `settings`/`users`/
>   `addresses` are `alwaysOn`), and a sector pack's files only when a
>   module from that pack is requested. The one existing exception —
>   `cart.prisma`'s `CartItemStitchingOption.option -> StitchingOption`, the
>   sole entry in `check-module-boundaries.mjs`'s own `KNOWN_SCHEMA_VIOLATIONS`
>   burn-down list — means `apparel`'s schema ships unconditionally today too;
>   the script names this override in its own comment, tied to that one
>   tracked entry, to be removed the same day that entry is paid off.
> - **`KNOWN_MODULE_COUPLINGS` is a real, hard module dependency, not just a
>   lint exception.** `catalog.module.ts` imports `InventoryModule` directly
>   (the same-transaction stock write `check-module-boundaries.mjs` already
>   documents) — requesting `catalog` without `inventory` produces a
>   dangling import and a broken client build. The script reads
>   `check-module-boundaries.mjs`'s own `KNOWN_MODULE_COUPLINGS` list (never
>   duplicated) and folds every requested module's coupling targets into the
>   effective module set, to a fixed point, the same way `alwaysOn` modules
>   are folded in.
> - **The modular per-module seed structure this spec assumes
>   (`apps/api/prisma/seeds/*.seed.ts`) does not exist.** Seeding here is one
>   monolithic `apps/api/prisma/seed.ts`; the script copies it as-is and
>   says so in its own comment, rather than inventing a split that isn't
>   real.
> - **No white-label `apps/web/theme.config.ts` (or equivalent) exists yet**
>   — branding already resolves through `packages/shared/src/brand.ts`
>   (Law 1), which the Core Transfer step already copies and an upgrade
>   already never touches. The ignore-rule is still coded, as a no-op via a
>   plain existence check, so the day such a file is added it is already
>   protected with no further change.
> - **`.client-build` lives in `os.tmpdir()`, not this repository's own
>   working tree**, despite this spec's own examples showing it repo-root-
>   relative. Prisma's CLI resolves `@prisma/client` relative to the
>   *schema* directory's own ancestry, and on failure falls back to silently
>   running `pnpm add`/`npm i` against the nearest ancestor `package.json`
>   it can find — with `.client-build` nested inside this repository, that
>   ancestor was this repository's own root `package.json`, and this is
>   what actually rewrote this repository's `pnpm-lock.yaml` once during
>   this script's own development (reverted before committing, never
>   pushed). Moving `.client-build` outside this repository's tree removes
>   the hazard at its root; `PRISMA_GENERATE_SKIP_AUTOINSTALL=true` and a
>   temporary, non-committed `node_modules` symlink (for `@prisma/client`/
>   `@nestjs/*` resolution during validation only, removed right after)
>   are defense in depth on top of that.
> - **`module-packs.ts` (a bare file directly under `src/modules/`, not
>   inside a per-module folder) has to ship unconditionally too**, alongside
>   `src/core/` — confirmed empirically: `core/config/meta.controller.ts`
>   imports it directly, so a delivery missing it fails `tsc` regardless of
>   which modules were requested. It is pack-catalog metadata for every
>   module the Blueprint knows about (not what this delivery enables — that
>   is `modules.registry.ts`, already AST-pruned in Phase 3), so it ships
>   as-is, unpruned.
> - **Phase 3's own `tsc --noEmit` validation reuses the real
>   `apps/api/tsconfig.json`**, copied into `.client-build` and removed again
>   after validation, rather than a hand-rolled set of compiler flags. A
>   hand-rolled `--moduleResolution bundler` (to resolve `@newax/shared`'s
>   package.json `"exports"` map, which classic `"moduleResolution": "node"`
>   never reads) was tried first and rejected: it silently changed real
>   narrowing behaviour on unrelated, already-correct code (a discriminated-
>   union check in `easypaisa.provider.ts` that `pnpm typecheck` passes
>   cleanly today) — a validation step that can fail on correct code is
>   worse than useless. The real tsconfig already solves the same resolution
>   problem with its own `paths` alias (its own comment explains why), so
>   reusing it is simpler, correct by construction, and — since its own
>   `include` is `src/**/*` — checks the whole copied tree, not just
>   `modules.registry.ts`'s reachable subset.
> - **A separate, named, NOT-yet-built gap this pass surfaced but did not
>   solve, because it is outside this spec's own seven phases**: no phase
>   here copies `apps/api/package.json`, `apps/api/tsconfig.json`,
>   `nest-cli.json`, the repo-root `package.json`/`pnpm-workspace.yaml`/
>   `turbo.json`, or any other project scaffolding — Phase 3b's own tsconfig
>   copy is a validation-only artifact, deleted again before Phase 7's
>   commit (see this file's own comment on `cleanupValidationArtifacts()`).
>   A delivered client repository cannot actually `pnpm install`/`nest build`
>   without these. Naming it here rather than silently shipping an
>   unbuildable repository — it is a separable, larger work order (a real
>   "Phase 8: Project Scaffolding"), sequenced, not stubbed.
> - **`--confirm-push` is additive to this spec's own Phase 7**, not a
>   rewording of it: every phase through creating the commit runs by
>   default; only the final `git push` is gated behind the flag, off by
>   default. Its absence prints the exact command a human runs by hand.

**File:** `scripts/sync-client.mjs`
**Purpose:** Automate the creation and upgrading of customized, stripped-down client repositories from the Master Blueprint, without relying on fragile regex and without overwriting custom client UI.

## Phase 1: Initialization & Validation
**Inputs:**
* `--repo`: URL of the client's Git repository (or 'new' for initial delivery).
* `--modules`: Comma-separated list of purchased modules (e.g., `core,books,managed-services`).

**Actions:**
1. Read `apps/api/src/modules/module-packs.ts` to validate that every requested module actually exists.
2. Clone the client's repository into a temporary `.client-build` directory (or initialize a fresh `git init` if it is a new client).

## Phase 2: The Engine Extraction (Backend)
**Actions:**
1. **Core Transfer:** Copy the foundational engine (`apps/api/src/core/`, `packages/shared/`) from the Blueprint over the client's repo.
2. **Targeted Copy:** Iterate through the Blueprint's `apps/api/src/modules/` directory. Copy **only** the specific folders that match the requested `--modules` list directly into the client build. (Never copy unpurchased modules).
3. **Active Pruning:** Scan the client's destination `modules/` directory. If any module folder exists there that is *not* in the requested list (e.g., a cancelled subscription from a previous upgrade), actively **delete** it.
4. **Database Scaffolding:** Iterate through `apps/api/prisma/schema/`. Copy only `core.prisma` and schemas matching the requested packs. 
5. **Validation:** Automatically run `npx prisma generate` inside the client build to prove the database schema compiles perfectly and has zero broken cross-pack relations.

## Phase 3: AST Modification (Bulletproof TypeScript)
*Why: We cannot use fragile string replacement. We must use `ts-morph` to natively understand the TypeScript code.*

**Actions:**
1. Load `apps/api/src/modules/modules.registry.ts` via `ts-morph`.
2. Locate the `FEATURE_MODULES` array. For every module *not* requested, delete its object from the array.
3. Locate the `import` statements at the top of the file. For every module *not* requested, safely delete its import line.
4. Format and save the file. The NestJS API is now perfectly configured to boot only the purchased modules, with zero TypeScript errors.

## Phase 4: The Glass Protection (Frontend Boundaries)
*Why: We must never overwrite a client's bespoke storefront or white-label branding during an upgrade.*

**Actions:**
1. **The Admin Panel:** Copy `apps/web/src/app/(admin)` to push the latest SaaS features to the client.
2. **The Storefront (Ignore Rule):** If this is an upgrade, completely ignore `apps/web/src/app/(storefront)` so the client's custom React components remain untouched. (If this is a fresh delivery, copy it as a Starter Template).
3. **Branding (Ignore Rule):** Explicitly ignore `apps/web/theme.config.ts` (or equivalent CSS files) so their logos and brand colors are preserved.

## Phase 5: IaaS & Environment Scaffolding
**Actions:**
1. Generate a tailored `.env.example` for the client.
2. **Automatic API Key Generation:** If `managed-services` was requested, the script will use Node's `crypto` module to automatically generate a highly secure, 64-character `AGENCY_API_KEY`. It will inject this real key directly into the `.env` file, and output a log reminding the agency to register this key in their central billing database.

## Phase 6: CI/CD & Database Cleanup
*Why: We cannot deliver the Blueprint's internal migrations, staging workflows, or dummy data for unpurchased sectors.*

**Actions:**
1. **Migration Purge:** Explicitly delete the apps/api/prisma/schema/migrations/ folder. The client must generate their own fresh migration history tailored to their specific subset of schemas.
2. **Modular Seeding:** The blueprint uses a multiple-seed architecture (apps/api/prisma/seeds/*.seed.ts). The script copies the main runner (seed.ts), but only copies the specific *.seed.ts files that match the requested modules. This guarantees the client's database seeds perfectly without TypeScript errors.
3. **Pipeline Cleanup:** Delete the Blueprint's .github/workflows/ (since staging and production deployment logic belongs exclusively to the Master Platform).

## Phase 7: Delivery & Pull Request
**Actions:**
1. `git add .` inside `.client-build`.
2. `git commit -m "chore: platform sync (modules: core, books)"`
3. Push the code to a new branch on the client's repository (e.g., `platform-upgrade-v2.1`).
4. Output a clean success log with instructions on how to review and merge the Pull Request.
