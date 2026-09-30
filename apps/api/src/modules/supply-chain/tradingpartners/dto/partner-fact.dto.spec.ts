import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  PARTNER_FACT_MAX_LINES,
  SubmitPartnerFactDto,
} from "./partner-fact.dto";

const valid = () => ({
  factId: "3f2c1a4e-8d5b-4c7a-9e11-2a6b7c8d9e01",
  type: "sale.dispatched",
  schemaVersion: 1,
  occurredAt: "2026-09-30T09:14:00Z",
  currency: "PKR",
  lines: [
    {
      gtin: "8901234567890",
      name: "Lawn suit",
      quantity: 40,
      unitPriceMinor: 349900,
    },
  ],
});

async function errorsFor(body: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(SubmitPartnerFactDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const flat = (e: (typeof errors)[number], prefix = ""): string[] => [
    ...(e.constraints ? [`${prefix}${e.property}`] : []),
    ...(e.children ?? []).flatMap((c) => flat(c, `${prefix}${e.property}.`)),
  ];
  return errors.flatMap((e) => flat(e));
}

describe("SubmitPartnerFactDto", () => {
  it("accepts a well-formed fact", async () => {
    expect(await errorsFor(valid())).toEqual([]);
  });

  it.each([
    ["a factId that is not a UUID", { factId: "not-a-uuid" }, "factId"],
    [
      "a UUID that is not version 4",
      { factId: "3f2c1a4e-8d5b-1c7a-9e11-2a6b7c8d9e01" },
      "factId",
    ],
    ["an unknown type", { type: "payment.made" }, "type"],
    ["an unknown schemaVersion", { schemaVersion: 2 }, "schemaVersion"],
    ["a date that is not ISO 8601", { occurredAt: "yesterday" }, "occurredAt"],
    ["a lowercase currency", { currency: "pkr" }, "currency"],
    ["no lines", { lines: [] }, "lines"],
  ])("refuses %s", async (_label, patch, field) => {
    expect(await errorsFor({ ...valid(), ...patch })).toContain(field);
  });

  it(`refuses more than ${PARTNER_FACT_MAX_LINES} lines`, async () => {
    const lines = Array.from(
      { length: PARTNER_FACT_MAX_LINES + 1 },
      () => valid().lines[0],
    );
    expect(await errorsFor({ ...valid(), lines })).toContain("lines");
  });

  it(`accepts exactly ${PARTNER_FACT_MAX_LINES} lines`, async () => {
    const lines = Array.from(
      { length: PARTNER_FACT_MAX_LINES },
      () => valid().lines[0],
    );
    expect(await errorsFor({ ...valid(), lines })).toEqual([]);
  });

  it.each([
    ["a gtin with letters", { gtin: "89012345678AB" }, "lines.gtin"],
    ["a gtin that is too short", { gtin: "1234567" }, "lines.gtin"],
    ["a zero quantity", { quantity: 0 }, "lines.quantity"],
    ["a fractional quantity", { quantity: 1.5 }, "lines.quantity"],
    ["a negative price", { unitPriceMinor: -1 }, "lines.unitPriceMinor"],
    ["a fractional price", { unitPriceMinor: 10.5 }, "lines.unitPriceMinor"],
    ["a name over 200 characters", { name: "x".repeat(201) }, "lines.name"],
  ])("refuses a line with %s", async (_label, patch, path) => {
    const body = valid();
    body.lines = [{ ...body.lines[0], ...patch }];
    const errors = await errorsFor(body);
    expect(errors.some((e) => e.endsWith(path.split(".")[1]))).toBe(true);
  });

  it("refuses a field the contract does not define", async () => {
    expect(await errorsFor({ ...valid(), sneaky: "x" })).toContain("sneaky");
  });
});
