# 13h. Hardening record: Procurement and the supplier lifecycle

Adversarial review of [13-procurement-supplier-lifecycle.md](./13-procurement-supplier-lifecycle.md) by the `harden:13:procurement-supplier-lifecycle` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The bill nobody checked  — strong

**Question:** Named tolerance for bill vs PO/GoodsReceiptItem match, and the status a bill outside it gets instead of silently posting UNPAID.

**Verified against:** purchasing.service.ts:516-551 (createSupplierBill checks only supplierId); purchasing.over_receipt_tolerance in settings.defaults.ts and receiveGoods (purchasing.service.ts:301-313) — a different, quantity-only tolerance

### Five commitments, one key  — solid

**Question:** Of PO create/send, receive, bill, pay — which should purchasing.manage alone perform, which need a senior second key above a spend ceiling, and where would that ceiling live?

**Verified against:** purchasing.controller.ts lines 96,103,110,137,144 (the 5 write actions) plus 82,89,123,130 (reads) — 9 total RequirePermission('purchasing.manage') grants, verified by grep -c

### A boolean is not a lifecycle  — strong

**Question:** Name the Supplier states from first contact to PO-refusal, the compliance docs each requires with expiry, and the line in createPurchaseOrder that would refuse a PO against an unapproved/expired supplier.

**Verified against:** purchasing.prisma:1 (Supplier.isActive Boolean @default(true), no status field); createPurchaseOrder (purchasing.service.ts:242-276) never fetches Supplier at all; identity-verification.prisma:16 (User-only KYC, no Party/Supplier link)

## Killed (0)

_Nothing was killed._


## Citations corrected (3)

- Lens 1: claimed grep -ri tolerance across apps/api returns nothing (concept doesn't exist). Actual: purchasing.over_receipt_tolerance exists in settings.defaults.ts, used in receiveGoods (purchasing.service.ts:301-313) — but it gates receipt quantity vs PO, not bill amount/quantity vs PO/GoodsReceiptItem. Reworded to state the real gap precisely instead of claiming total absence.
- Lens 2: doneTest claimed grep -c "RequirePermission('purchasing.manage')" on purchasing.controller.ts returns 5. Actual count is 9 (4 read/list endpoints plus the 5 named write moments at lines 96, 103, 110, 137, 144). Corrected to 9 with the write-moment line numbers called out.
- Lens 3: cited Supplier as defined in parties.prisma. Actual: Supplier is defined in purchasing.prisma:1; parties.prisma defines the separate Party model that Supplier.partyId optionally references. Corrected both the Why citation and the doneTest grep target to purchasing.prisma.
