import { describe, expect, it } from "vitest";
import { paginateByCursor } from "../src/lib/publicApis/gov24SimpleFind/matcher";

describe("gov24 simplefind pagination", () => {
  it("iterates over 300 items without duplication", () => {
    const items = Array.from({ length: 320 }, (_, idx) => `id-${idx + 1}`);
    const seen = new Set<string>();
    let cursor = 0;

    while (true) {
      const page = paginateByCursor(items, cursor, 50);
      for (const id of page.items) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(seen.size).toBe(320);
  });
});

