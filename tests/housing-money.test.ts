import { describe, expect, it } from "vitest";
import { manwonToWon, toWonFromManwon } from "../src/lib/housing/money";

describe("housing money unit conversion", () => {
  it("converts 만원 amounts to 원 consistently", () => {
    expect(manwonToWon(249000)).toBe(2_490_000_000);
    expect(toWonFromManwon([100, 250.5])).toEqual([1_000_000, 2_505_000]);
  });
});
