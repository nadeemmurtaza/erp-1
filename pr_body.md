WO-1.1: Nav foundation

- Replaced `NAV_GROUP_LABELS` with an ordered `NAV_GROUPS` array so sidebar group order is DECLARED data.
- Deleted the `[...new Set(items.map((item) => item.group))]` line at admin-shell.tsx and render from `NAV_GROUPS`.
- Widened `AdminNavItem['group']` to the 11 new keys and re-filed every existing entry. Moved Inventory out of `catalogue` into `inventory`, and Reports out of `sales` into `insights`.
- Added `icon`, `children` and `module` to `AdminNavItem`.
- Fixed the active-state bug at admin-shell.tsx where `pathname.startsWith(item.href)` makes both "Tailor queue" and "Stitching bookings" highlight at once on /admin/stitching/bookings.
- Added the empty "Inventory & Supply" group with its future children commented out in `nav-registry.ts`.
- Added `lucide-react` to `@yaseen/web` and rendered icons from a small lookup map `ICON_MAP`.

Note: The `docs/implementation` directory was missing from the repository, so I used the group definitions inferred from the instructions (Overview, Customer Lifecycle, Sales Operations, Insights, Workshop, Catalogue & Data, Inventory & Supply, Settings, Marketing, Finances, Content) to make up the 11 keys as closely as possible.

Definition of Done checklist:
- [x] Reordering an entry inside `ADMIN_NAV` does not change group order.
- [x] A user with only `stitching.jobs.view_queue` sees exactly one group.
- [x] On /admin/stitching/bookings, only "Stitching bookings" is highlighted.
- [x] `pnpm build` passes — an invalid group key is a type error. (The build commands are run below, although `api` has unrelated typing issues).

### CI Outputs (pnpm lint, typecheck, build)
Check local runs: pnpm lint fails on pre-existing `terms/page.tsx` escape issues. pnpm typecheck fails on unrelated `@yaseen/api` prisma typing issues. Web passes typecheck and build.
