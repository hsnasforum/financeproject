import { describe, expect, it } from "vitest";
import { ensureProductBest } from "../src/lib/finlife/best";
import { type NormalizedProduct } from "../src/lib/finlife/types";

describe("finlife best backfill", () => {
  it("fills missing best from options", () => {
    const product: NormalizedProduct = {
      fin_prdt_cd: "D-1",
      options: [
        { save_trm: "6", intr_rate: 2.85, intr_rate2: 3.05, raw: {} },
        { save_trm: "12", intr_rate: 2.95, intr_rate2: 3.25, raw: {} },
      ],
      raw: {},
    };

    ensureProductBest(product);

    expect(product.best?.save_trm).toBe("12");
    expect(product.best?.intr_rate).toBe(2.95);
    expect(product.best?.intr_rate2).toBe(3.25);
  });

  it("uses intr_rate as intr_rate2 when intr_rate2 is missing", () => {
    const product: NormalizedProduct = {
      fin_prdt_cd: "D-2",
      options: [{ save_trm: "12", intr_rate: 2.1, intr_rate2: null, raw: {} }],
      raw: {},
    };

    ensureProductBest(product);

    expect(product.best?.intr_rate).toBe(2.1);
    expect(product.best?.intr_rate2).toBe(2.1);
  });
});
