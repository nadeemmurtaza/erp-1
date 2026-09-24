# 24h. Hardening record: Fraud and the malicious insider (docs/erp-lenses/fraud-insider-risk/24-fraud-insider-risk.md)

Adversarial review of [24-fraud-insider-risk.md](./24-fraud-insider-risk.md) by the `harden:24:fraud-insider-risk` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The void that outruns the refund  — strong

**Question:** Name the check OrdersService.changeStatus() runs against Payment.status before allowing CANCELLED, and the mechanism that reverses the posted journal entry when that check is skipped.

**Verified against:** ALLOWED_TRANSITIONS orders.service.ts:58/672; changeStatus() :658-710 never reads Payment.status or calls reverseEntry; reverseEntry() accounting.service.ts:102 is called only from the separate payment.refunded handler (PostingRulesSubscriber) - all verified by grep/read

### The write-off with no address  — strong

**Question:** Name the field that records which of the 100+ locations a manual stock write-off happened at, and say what adjust() uses today when it is absent.

**Verified against:** AdjustStockDto inventory.dto.ts:15-30 has no locationId; InventoryAdminController.adjust() inventory.controller.ts:41-61 always resolves defaultLocationId(); reasonMap :46-48 maps only 'damaged'; STOCK_ADJUSTMENT_REASONS has no write-off option; WRITE_OFF enum value exists in inventory.prisma:13 but is unreachable via this endpoint

### The price nobody can point to  — solid

**Question:** Name the permission key, distinct from pos.operate, that would gate a till price override, and the column that would preserve the catalog price it replaced.

**Verified against:** pos.module.ts:29 states override unbuilt; placeFromPos() orders.service.ts:420,846 derives unitPrice only from priceOverride/basePrice; OrderItem orders.prisma:124-129 has no listPrice; payments.approve permissions.ts:83 boolean, pos.operate :77 and pos.manage :71 both exist as real distinct keys

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- None required - all citations (ALLOWED_TRANSITIONS/changeStatus in orders.service.ts, reverseEntry in accounting.service.ts, payment.refunded handler in PostingRulesSubscriber, AdjustStockDto/STOCK_ADJUSTMENT_REASONS in inventory.dto.ts, adjust()/reasonMap in inventory.controller.ts, StockMovementReason.WRITE_OFF in inventory.prisma, pos.module.ts:29, placeFromPos() price derivation, OrderItem schema, and payments.approve/pos.operate/pos.manage in permissions.ts) were opened and confirmed accurate as stated.
- Noted (not a correction, a clarification): the doc cites 'permissions.ts:83' without the package path; the real file is packages/shared/src/permissions.ts, and this abbreviation matches the established citation convention used across the rest of this doc set, so it was left as-is.
