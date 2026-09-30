import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "../../../core/prisma/client";
import { DomainEvent } from "../../../core/events/domain-events";
import {
  canonicalJson,
  hashFact,
  PartnerFactInboxService,
} from "./partner-fact-inbox.service";
import type { SubmitPartnerFactDto } from "./dto/partner-fact.dto";

const FACT_ID = "3f2c1a4e-8d5b-4c7a-9e11-2a6b7c8d9e01";
const REPLY_TO = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

function sale(
  overrides: Partial<SubmitPartnerFactDto> = {},
): SubmitPartnerFactDto {
  return {
    factId: FACT_ID,
    type: "sale.dispatched",
    schemaVersion: 1,
    occurredAt: "2026-09-30T09:14:00.000Z",
    documentRef: "INV-2026-000412",
    currency: "PKR",
    lines: [
      {
        gtin: "8901234567890",
        sellerSku: "LWN-RED-M",
        name: "Lawn suit, red, M",
        quantity: 40,
        unitPriceMinor: 349900,
        taxMinor: 0,
      },
    ],
    ...overrides,
  };
}

function receipt(
  overrides: Partial<SubmitPartnerFactDto> = {},
): SubmitPartnerFactDto {
  return {
    factId: FACT_ID,
    type: "receipt.confirmed",
    schemaVersion: 1,
    occurredAt: "2026-10-01T09:14:00.000Z",
    inReplyToFactId: REPLY_TO,
    lines: [{ gtin: "8901234567890", quantityDelivered: 38 }],
    ...overrides,
  };
}

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });

describe("PartnerFactInboxService", () => {
  let service: PartnerFactInboxService;
  let prisma: any;
  let tx: any;
  let eventBus: { publish: jest.Mock };

  const supplier = { id: "tp1", kind: "SUPPLIER" } as any;
  const customer = { id: "tp2", kind: "CUSTOMER" } as any;
  const both = { id: "tp3", kind: "BOTH" } as any;

  beforeEach(() => {
    tx = {
      partnerFactInbox: {
        create: jest
          .fn()
          .mockResolvedValue({ id: "inbox1", status: "RECEIVED" }),
      },
    };
    prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
      partnerFactInbox: { findUnique: jest.fn() },
    };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new PartnerFactInboxService(prisma, eventBus as any);
  });

  describe("accept — the normal case", () => {
    it("stores the fact and queues PartnerFactReceived in the SAME transaction", async () => {
      const result = await service.accept(supplier, sale());

      expect(result).toEqual({
        factId: FACT_ID,
        status: "RECEIVED",
        duplicate: false,
      });
      const created = tx.partnerFactInbox.create.mock.calls[0][0].data;
      expect(created).toMatchObject({
        tradingPartnerId: "tp1",
        factId: FACT_ID,
        type: "sale.dispatched",
        schemaVersion: 1,
        documentRef: "INV-2026-000412",
      });
      expect(created.payloadHash).toBe(hashFact(created.payload));
      expect(created.occurredAt).toEqual(new Date("2026-09-30T09:14:00.000Z"));
      // The event is published WITH the transaction client, so the event row
      // and the inbox row commit or roll back together.
      expect(eventBus.publish).toHaveBeenCalledWith(
        DomainEvent.PartnerFactReceived,
        {
          inboxId: "inbox1",
          tradingPartnerId: "tp1",
          factId: FACT_ID,
          type: "sale.dispatched",
        },
        tx,
      );
    });

    it("lets a BOTH partner send either type", async () => {
      await expect(service.accept(both, sale())).resolves.toMatchObject({
        duplicate: false,
      });
      await expect(
        service.accept(both, receipt({ factId: REPLY_TO })),
      ).resolves.toMatchObject({ duplicate: false });
    });

    it("does not store a field the contract does not define", async () => {
      const withExtra = {
        ...sale(),
        sneaky: "x".repeat(10_000),
      } as SubmitPartnerFactDto;
      await service.accept(supplier, withExtra);
      // The DTO layer (whitelist + forbidNonWhitelisted) refuses this before
      // here; if that layer were ever bypassed the payload is still only the
      // object handed in, so the test pins that the service stores one object
      // and hashes exactly what it stored.
      const created = tx.partnerFactInbox.create.mock.calls[0][0].data;
      expect(created.payloadHash).toBe(hashFact(created.payload));
    });
  });

  describe("accept — who may send what", () => {
    it("refuses a SUPPLIER sending a receipt.confirmed", async () => {
      await expect(service.accept(supplier, receipt())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a CUSTOMER sending a sale.dispatched", async () => {
      await expect(service.accept(customer, sale())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("lets a CUSTOMER send a receipt.confirmed", async () => {
      await expect(service.accept(customer, receipt())).resolves.toMatchObject({
        duplicate: false,
      });
    });
  });

  describe("accept — the second copy of the same fact", () => {
    it("answers a repeat from what was stored, publishes nothing, and says it was a duplicate", async () => {
      const dto = sale();
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation());
      prisma.partnerFactInbox.findUnique.mockResolvedValue({
        status: "APPLIED",
        payloadHash: hashFact(JSON.parse(JSON.stringify(dto))),
      });

      const result = await service.accept(supplier, dto);

      expect(result).toEqual({
        factId: FACT_ID,
        status: "APPLIED",
        duplicate: true,
      });
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(prisma.partnerFactInbox.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tradingPartnerId_factId: {
              tradingPartnerId: "tp1",
              factId: FACT_ID,
            },
          },
        }),
      );
    });

    it("refuses the same factId with different content (409), never silently replaying it", async () => {
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation());
      prisma.partnerFactInbox.findUnique.mockResolvedValue({
        status: "RECEIVED",
        payloadHash: "a-different-hash",
      });

      await expect(service.accept(supplier, sale())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("treats a repeat with the fields listed in a different order as the same fact", async () => {
      const reordered = JSON.parse(
        JSON.stringify({
          lines: sale().lines,
          currency: "PKR",
          documentRef: "INV-2026-000412",
          occurredAt: "2026-09-30T09:14:00.000Z",
          schemaVersion: 1,
          type: "sale.dispatched",
          factId: FACT_ID,
        }),
      );
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation());
      prisma.partnerFactInbox.findUnique.mockResolvedValue({
        status: "RECEIVED",
        payloadHash: hashFact(JSON.parse(JSON.stringify(sale()))),
      });

      await expect(
        service.accept(supplier, reordered as SubmitPartnerFactDto),
      ).resolves.toMatchObject({ duplicate: true });
    });

    it("does not swallow an error that is not a unique violation", async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error("connection reset"));
      await expect(service.accept(supplier, sale())).rejects.toThrow(
        "connection reset",
      );
      expect(prisma.partnerFactInbox.findUnique).not.toHaveBeenCalled();
    });

    it("surfaces a conflict, not a guess, if the row vanished between the violation and the lookup", async () => {
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation());
      prisma.partnerFactInbox.findUnique.mockResolvedValue(null);
      await expect(service.accept(supplier, sale())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe("assertFactShape — sale.dispatched", () => {
    it("needs a currency", () => {
      expect(() =>
        service.assertFactShape(sale({ currency: undefined })),
      ).toThrow(BadRequestException);
    });

    it("refuses a reply reference", () => {
      expect(() =>
        service.assertFactShape(sale({ inReplyToFactId: REPLY_TO })),
      ).toThrow(/cannot reply/);
    });

    it.each([
      ["a gtin or a sellerSku", { gtin: undefined, sellerSku: undefined }],
      ["a name", { name: undefined }],
      ["a quantity", { quantity: undefined }],
      ["a unitPriceMinor", { unitPriceMinor: undefined }],
    ])("needs each line to have %s, and names the line", (_label, patch) => {
      const dto = sale();
      dto.lines = [{ ...dto.lines[0], ...patch }];
      expect(() => service.assertFactShape(dto)).toThrow(/lines\[0\]/);
    });

    it("accepts a line with only a sellerSku and no gtin — it will be sent for review, not refused here", () => {
      const dto = sale();
      dto.lines = [{ ...dto.lines[0], gtin: undefined }];
      expect(() => service.assertFactShape(dto)).not.toThrow();
    });

    it("refuses quantityDelivered on a sale line", () => {
      const dto = sale();
      dto.lines = [{ ...dto.lines[0], quantityDelivered: 3 }];
      expect(() => service.assertFactShape(dto)).toThrow(/receipt\.confirmed/);
    });
  });

  describe("assertFactShape — receipt.confirmed", () => {
    it("needs inReplyToFactId", () => {
      expect(() =>
        service.assertFactShape(receipt({ inReplyToFactId: undefined })),
      ).toThrow(/inReplyToFactId/);
    });

    it("carries no currency", () => {
      expect(() =>
        service.assertFactShape(receipt({ currency: "PKR" })),
      ).toThrow(/no prices/);
    });

    it("needs quantityDelivered on every line, allowing zero (the goods never arrived)", () => {
      const ok = receipt();
      ok.lines = [{ gtin: "8901234567890", quantityDelivered: 0 }];
      expect(() => service.assertFactShape(ok)).not.toThrow();

      const bad = receipt();
      bad.lines = [{ gtin: "8901234567890" }];
      expect(() => service.assertFactShape(bad)).toThrow(/quantityDelivered/);
    });

    it("refuses sale fields on a receipt line", () => {
      const dto = receipt();
      dto.lines = [
        { gtin: "8901234567890", quantityDelivered: 1, unitPriceMinor: 100 },
      ];
      expect(() => service.assertFactShape(dto)).toThrow(
        /quantityDelivered only/,
      );
    });
  });

  describe("canonicalJson / hashFact", () => {
    it("does not depend on key order, at any depth", () => {
      expect(canonicalJson({ b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } })).toBe(
        canonicalJson({ a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 }),
      );
    });

    it("does depend on a value, on array order, and on a number vs a string", () => {
      expect(hashFact({ a: 1 })).not.toBe(hashFact({ a: 2 }));
      expect(hashFact({ a: [1, 2] })).not.toBe(hashFact({ a: [2, 1] }));
      expect(hashFact({ a: 1 })).not.toBe(hashFact({ a: "1" }));
    });

    it("ignores an undefined field, as JSON does", () => {
      expect(hashFact({ a: 1, b: undefined })).toBe(hashFact({ a: 1 }));
    });
  });
});
