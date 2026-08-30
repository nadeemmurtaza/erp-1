# 12 - Extractor & Sync Script Specification

**File:** scripts/sync-client.mjs
**Purpose:** Automate the creation and upgrading of customized, stripped-down client repositories from the Master Blueprint, without relying on fragile regex and without overwriting custom client UI.

## Phase 1: Initialization & Validation
**Inputs:**
* --repo: URL of the client's Git repository (or 'new' for initial delivery).
* --modules: Comma-separated list of purchased modules (e.g., core,books,managed-services).

**Actions:**
1. Read pps/api/src/modules/module-packs.ts to validate that every requested module actually exists.
2. Clone the client's repository into a temporary .client-build directory (or initialize a fresh git init if it is a new client).

## Phase 2: The Engine Extraction (Backend)
**Actions:**
1. **Core Transfer:** Copy the foundational engine (pps/api/src/core/, packages/shared/) from the Blueprint over the client's repo.
2. **Module Filtering:** Iterate through pps/api/src/modules/. Copy **only** the folders that match the requested --modules list.
3. **Database Scaffolding:** Iterate through pps/api/prisma/schema/. Copy only core.prisma and schemas matching the requested packs. 
4. **Validation:** Automatically run 
px prisma generate inside the client build to prove the database schema compiles perfectly and has zero broken cross-pack relations.

## Phase 3: AST Modification (Bulletproof TypeScript)
*Why: We cannot use fragile string replacement. We must use 	s-morph to natively understand the TypeScript code.*

**Actions:**
1. Load pps/api/src/modules/modules.registry.ts via 	s-morph.
2. Locate the FEATURE_MODULES array. For every module *not* requested, delete its object from the array.
3. Locate the import statements at the top of the file. For every module *not* requested, safely delete its import line.
4. Format and save the file. The NestJS API is now perfectly configured to boot only the purchased modules, with zero TypeScript errors.

## Phase 4: The Glass Protection (Frontend Boundaries)
*Why: We must never overwrite a client's bespoke storefront or white-label branding during an upgrade.*

**Actions:**
1. **The Admin Panel:** Copy pps/web/src/app/(admin) to push the latest SaaS features to the client.
2. **The Storefront (Ignore Rule):** If this is an upgrade, completely ignore pps/web/src/app/(storefront) so the client's custom React components remain untouched. (If this is a fresh delivery, copy it as a Starter Template).
3. **Branding (Ignore Rule):** Explicitly ignore pps/web/theme.config.ts (or equivalent CSS files) so their logos and brand colors are preserved.

## Phase 5: IaaS & Environment Scaffolding
**Actions:**
1. Generate a tailored .env.example for the client.
2. If managed-services was included in the --modules list, inject the AGENCY_API_KEY placeholder into the template to support the in-app billing dashboard.

## Phase 6: Delivery & Pull Request
**Actions:**
1. git add . inside .client-build.
2. git commit -m "chore: platform sync (modules: core, books)"
3. Push the code to a new branch on the client's repository (e.g., platform-upgrade-v2.1).
4. Output a clean success log with instructions on how to review and merge the Pull Request.