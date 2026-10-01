import { changeTone, foldShares, periodChange, sharePct } from "./chart-math";

describe("periodChange", () => {
  it("reports a rise and a fall with the absolute percentage", () => {
    expect(periodChange(115, 100)).toEqual({ kind: "up", pct: 15 });
    expect(periodChange(75, 100)).toEqual({ kind: "down", pct: 25 });
  });

  it("rounds to one decimal place", () => {
    expect(periodChange(18_400_000, 16_100_000)).toEqual({
      kind: "up",
      pct: 14.3,
    });
  });

  it("calls an unchanged value flat", () => {
    expect(periodChange(100, 100)).toEqual({ kind: "flat", pct: 0 });
  });

  it("rounds a change under a tenth of a percent to flat, not +0.0%", () => {
    expect(periodChange(100_000, 100_001)).toEqual({ kind: "flat", pct: 0 });
  });

  it("does not invent a percentage from a zero baseline", () => {
    expect(periodChange(40, 0)).toEqual({ kind: "new", pct: 0 });
    expect(periodChange(0, 0)).toEqual({ kind: "flat", pct: 0 });
  });

  it("reports a fall to zero as a 100% drop", () => {
    expect(periodChange(0, 50)).toEqual({ kind: "down", pct: 100 });
  });
});

describe("changeTone", () => {
  it("is success when the good direction was taken and danger when it was not", () => {
    expect(changeTone("up", true)).toBe("success");
    expect(changeTone("down", true)).toBe("danger");
  });

  it("inverts for a measure where lower is better", () => {
    expect(changeTone("down", false)).toBe("success");
    expect(changeTone("up", false)).toBe("danger");
  });

  it("keeps flat and new neutral either way", () => {
    expect(changeTone("flat", true)).toBe("neutral");
    expect(changeTone("new", false)).toBe("neutral");
  });
});

describe("foldShares", () => {
  const item = (label: string, value: number) => ({ label, value });

  it("sorts descending", () => {
    expect(
      foldShares([item("a", 1), item("c", 3), item("b", 2)]).map(
        (s) => s.label,
      ),
    ).toEqual(["c", "b", "a"]);
  });

  it("folds everything past the fifth slice into one Other", () => {
    const slices = foldShares(
      [1, 2, 3, 4, 5, 6, 7].map((n) => item(`s${n}`, n)),
    );
    expect(slices).toHaveLength(6);
    expect(slices.at(-1)).toEqual({ label: "Other", value: 3 });
  });

  it("adds no Other when nothing is left over", () => {
    expect(foldShares([item("a", 2), item("b", 1)])).toHaveLength(2);
  });

  it("never exceeds five named slices, whatever the caller asks for", () => {
    const slices = foldShares(
      Array.from({ length: 9 }, (_, i) => item(`s${i}`, i + 1)),
      8,
    );
    expect(slices).toHaveLength(6);
  });

  it("honours a smaller cap", () => {
    const slices = foldShares([item("a", 5), item("b", 4), item("c", 3)], 2);
    expect(slices).toEqual([
      item("a", 5),
      item("b", 4),
      { label: "Other", value: 3 },
    ]);
  });

  it("drops a tail that sums to zero instead of drawing an empty slice", () => {
    expect(foldShares([item("a", 5), item("b", 0), item("c", 0)], 1)).toEqual([
      item("a", 5),
    ]);
  });

  it("does not mutate its input", () => {
    const input = [item("a", 1), item("b", 2)];
    foldShares(input);
    expect(input.map((s) => s.label)).toEqual(["a", "b"]);
  });

  it("returns nothing for nothing", () => {
    expect(foldShares([])).toEqual([]);
  });
});

describe("sharePct", () => {
  it("is a percentage to one decimal place", () => {
    expect(sharePct(1, 3)).toBe(33.3);
    expect(sharePct(1, 2)).toBe(50);
  });

  it("is 0 when the whole is 0, never NaN", () => {
    expect(sharePct(0, 0)).toBe(0);
  });
});
