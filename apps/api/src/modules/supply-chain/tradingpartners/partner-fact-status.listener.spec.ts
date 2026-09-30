import { PartnerFactStatusListener } from "./partner-fact-status.listener";

describe("PartnerFactStatusListener", () => {
  let listener: PartnerFactStatusListener;
  let prisma: { partnerFactInbox: { updateMany: jest.Mock } };

  const base = {
    inboxId: "inbox1",
    tradingPartnerId: "tp1",
    factId: "f1",
    type: "sale.dispatched",
  };

  beforeEach(() => {
    prisma = {
      partnerFactInbox: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    listener = new PartnerFactStatusListener(prisma as any);
  });

  it("marks a RECEIVED or NEEDS_REVIEW fact APPLIED and records the purchase order", async () => {
    await listener.onApplied({ ...base, purchaseOrderId: "po1" });

    expect(prisma.partnerFactInbox.updateMany).toHaveBeenCalledWith({
      where: { id: "inbox1", status: { in: ["RECEIVED", "NEEDS_REVIEW"] } },
      data: {
        status: "APPLIED",
        statusReason: null,
        appliedPurchaseOrderId: "po1",
      },
    });
  });

  it("records no purchase order when the fact produced none", async () => {
    await listener.onApplied(base);
    expect(
      prisma.partnerFactInbox.updateMany.mock.calls[0][0].data
        .appliedPurchaseOrderId,
    ).toBeNull();
  });

  it("is a no-op, not an error, when the fact was already APPLIED (at-least-once delivery)", async () => {
    prisma.partnerFactInbox.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      listener.onApplied({ ...base, purchaseOrderId: "po1" }),
    ).resolves.toBeUndefined();
  });

  it("parks a RECEIVED fact in review with the reason", async () => {
    await listener.onNeedsReview({
      ...base,
      reason: "Unknown barcode 8901234567890",
    });

    expect(prisma.partnerFactInbox.updateMany).toHaveBeenCalledWith({
      where: { id: "inbox1", status: "RECEIVED" },
      data: {
        status: "NEEDS_REVIEW",
        statusReason: "Unknown barcode 8901234567890",
      },
    });
  });

  it("only ever moves a RECEIVED fact to review, so a late event cannot pull an APPLIED fact backwards", async () => {
    await listener.onNeedsReview({ ...base, reason: "late" });
    expect(
      prisma.partnerFactInbox.updateMany.mock.calls[0][0].where.status,
    ).toBe("RECEIVED");
  });

  it("bounds the reason it stores", async () => {
    await listener.onNeedsReview({ ...base, reason: "x".repeat(5_000) });
    expect(
      prisma.partnerFactInbox.updateMany.mock.calls[0][0].data.statusReason,
    ).toHaveLength(500);
  });
});
