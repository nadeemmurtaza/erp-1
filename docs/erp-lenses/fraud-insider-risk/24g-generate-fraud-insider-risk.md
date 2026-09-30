# 24g generate fraud insider risk

Output of the `gen:24:fraud-insider-risk` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Fraud and the malicious insider

## File

docs/erp-lenses/fraud-insider-risk/24-fraud-insider-risk.md

## Lenses

### The void that outruns the refund

**Question:** Name the check OrdersService.changeStatus() runs against Payment.status before it allows CANCELLED, and the mechanism that reverses the posted journal entry when that check is skipped.

**Grounding:** ALLOWED_TRANSITIONS and changeStatus() in apps/api/src/modules/sales/orders/orders.service.ts:58-67,657-707 (never reads Payment.status, never calls reverseEntry); AccountingService.reverseEntry() at accounting.service.ts:102 (full-reversal-only, no partial-amount param)

### The write-off with no address

**Question:** Name the field that records which of the 100+ locations a manual stock write-off actually happened at, and say what adjust() uses today when that field is absent.

**Grounding:** AdjustStockDto (apps/api/src/modules/supply-chain/inventory/dto/inventory.dto.ts:15-30, no locationId); InventoryAdminController.adjust() (inventory.controller.ts:39-61, defaultLocationId() at :51, reasonMap at :46-49); StockMovementReason.WRITE_OFF comment 'lost, stolen, expired' (inventory.prisma:13)

### The price nobody can point to

**Question:** Name the permission key, distinct from pos.operate, that would gate a till price override, and the column that would preserve the catalog price it replaced.

**Grounding:** pos.module.ts:29 ('a till-side price override remain[s] unbuilt'); placeFromPos() unitPrice derivation at orders.service.ts:420; OrderItem.unitPrice/discountUnit (orders.prisma:124-129, no listPrice); payments.approve boolean key (permissions.ts:83)

## Absences

- No check comparing Payment.status to an order's cancellation in OrdersService.changeStatus()
- No locationId field on AdjustStockDto or anywhere in the manual stock write-off path
- No till-side price override capability at all (explicitly noted as unbuilt in pos.module.ts:29) and no listPrice column to preserve a pre-override price
- No amount-banded or rank-based approval anywhere in the codebase — payments.approve is a boolean permission with no ceiling, and no rank/grade/approval-limit model exists

