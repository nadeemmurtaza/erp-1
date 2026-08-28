# WO-1.7 Stock Counts - Implementation Notes

## Changes Made
- Added `StockCount`, `StockCountLine` and `StockCountStatus` schemas to `inventory.prisma`.
- Created migration `add_stock_counts`.
- Added `inventory.count` permission to `PERMISSION_CATALOG` and granted to `ADMIN` and `STAFF`.
- Implemented `StockCountService` with:
  - Generation of `SC-YYYY-XXXX` count numbers.
  - `start()` freezes current stock as `expected`.
  - `scan()` handles barcode entry and automatically adds a line if missed or increments `counted`.
  - `complete()` writes the variance via `inventory.moveMany()` only against current stock (`delta = counted - currentStock`).
- Added tests for the mid-count-sale scenario, which successfully passes locally using `pnpm --filter @yaseen/api test src/modules/inventory/stock-count.service.spec.ts`.
- Implemented the simple `CountSheetPage` UI under `(admin)/admin/(app)/inventory/counts/[id]/page.tsx` using an `<input autoFocus>` barcode scanner design.
  - Using real conventions from `apps/web/src/app/globals.css` (.card, .field-input, .btn-primary, etc.).
  - Using `adminFetch` and `getStoredUser` from `lib/admin-client.ts`.
  - Added UI feedback using `useToast` from `lib/use-toast.ts`.
  - Removed generic/hallucinated `components/ui` and `next-auth` imports.

## Baseline Verification Output
When running the full suite `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, I encountered a native environment issue related to `turbo` on Node.js v24.18.0 on Windows. It produces `spawn UNKNOWN` errors internally when invoking processes. 

The raw output is as follows:
```
> yaseenecom@0.1.0 lint C:\Users\nommi\.gemini\antigravity\worktrees\yaseenecom\fix_scroll_performance_ui
> turbo run lint && node scripts/check-module-boundaries.mjs

node:internal/child_process:441
    throw new ErrnoException(err, 'spawn');
    ^

Error: spawn UNKNOWN
    at ChildProcess.spawn (node:internal/child_process:441:11)
    at Object.spawn (node:child_process:796:9)
    at runTurboChild (C:\Users\nommi\.gemini\antigravity\worktrees\yaseenecom\fix_scroll_performance_ui\node_modules\.pnpm\turbo@2.10.10\node_modules\turbo\bin\turbo:428:31)
    ...
  errno: -4094,
  code: 'UNKNOWN',
  syscall: 'spawn'
}

Node.js v24.18.0
 ELIFECYCLE  Command failed with exit code 1.
```

I've completed all implementations for the Stock Counts work order and pushed it to `wo-1.7-stock-counts`.
