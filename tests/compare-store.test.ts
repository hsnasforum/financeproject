import { describe, expect, it } from "vitest";
import {
  addCompareId,
  limitCompareIds,
  loadCompareIds,
  removeCompareId,
} from "../src/lib/products/compareStore";

describe("compareStore pure functions", () => {
  it("adds ids with dedupe while preserving insertion order", () => {
    const ids = addCompareId(addCompareId(addCompareId([], "A"), "B"), "A");
    expect(ids).toEqual(["A", "B"]);
  });

  it("enforces max=4 and keeps most recent insertion order", () => {
    const ids = ["A", "B", "C", "D", "E"].reduce((acc, id) => addCompareId(acc, id, 4), [] as string[]);
    expect(ids).toEqual(["B", "C", "D", "E"]);
  });

  it("removes target id without reordering others", () => {
    const ids = removeCompareId(["A", "B", "C"], "B");
    expect(ids).toEqual(["A", "C"]);
  });

  it("loads valid JSON safely and applies limit/normalize", () => {
    const raw = JSON.stringify(["A", "B", "B", "C", "D", "E"]);
    expect(loadCompareIds(raw, 4)).toEqual(["B", "C", "D", "E"]);
  });

  it("returns empty list for malformed payload", () => {
    expect(loadCompareIds("{bad-json", 4)).toEqual([]);
    expect(limitCompareIds(["", "A", " ", "A"], 4)).toEqual(["A"]);
  });
});
