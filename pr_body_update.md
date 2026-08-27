WO-1.1: Nav foundation

- Replaced `NAV_GROUP_LABELS` with an ordered `NAV_GROUPS` array so sidebar group order is DECLARED data.
- Deleted the `[...new Set(items.map((item) => item.group))]` line at admin-shell.tsx and render from `NAV_GROUPS`.
- Widened `AdminNavItem['group']` to the 11 new keys and re-filed every existing entry. Moved Inventory out of `catalogue` into `inventory`, and Reports out of `sales` into `insights`.
- Added `icon`, `children` and `module` to `AdminNavItem`.
- Fixed the active-state bug at admin-shell.tsx where `pathname.startsWith(item.href)` makes both "Tailor queue" and "Stitching bookings" highlight at once on /admin/stitching/bookings.
- Added the "Inventory & Supply" group with its future children commented out in `ADMIN_NAV`.
- Added `lucide-react` to `@yaseen/web` and rendered icons from a small lookup map `ICON_MAP`.

Definition of Done checklist:
- [x] Reordering an entry inside `ADMIN_NAV` does not change group order.
- [x] A user with only `stitching.jobs.view_queue` sees exactly one group.
- [x] On /admin/stitching/bookings, only "Stitching bookings" is highlighted.
- [x] `pnpm build` passes — an invalid group key is a type error.

### CI Outputs
`pnpm lint`, `pnpm typecheck`, and `pnpm build` passed for `@yaseen/web`. Note: The root-level runs for these commands fail due to pre-existing errors in other packages (e.g., Prisma type errors in `api`, unescaped quote in `terms/page.tsx`).
I was unable to run `pnpm test` as Docker is not available in my environment to spin up Postgres. I am stating this explicitly.
