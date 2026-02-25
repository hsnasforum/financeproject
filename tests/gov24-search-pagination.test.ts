import { describe, expect, it } from "vitest";
import { buildGov24SearchPayload } from "../src/lib/publicApis/gov24SearchView";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function makeItem(index: number): BenefitCandidate {
  return {
    id: `svc-${index}`,
    title: `서비스 ${index}`,
    summary: "요약",
    eligibilityHints: [],
    region: { scope: "NATIONWIDE", tags: ["전국"] },
    source: "test",
    fetchedAt: "2026-02-20T00:00:00.000Z",
  };
}

describe("gov24 search pagination", () => {
  it("can traverse more than 200 items with cursor", () => {
    const items = Array.from({ length: 320 }, (_, idx) => makeItem(idx + 1));
    const collected = new Set<string>();
    let cursor = 0;

    while (true) {
      const payload = buildGov24SearchPayload(items, { query: "", cursor, pageSize: 50 }, {});
      for (const row of payload.data.items) {
        expect(collected.has(row.id)).toBe(false);
        collected.add(row.id);
      }
      const next = payload.data.page.nextCursor;
      if (next === null) break;
      cursor = next;
    }

    expect(collected.size).toBe(320);
  });
});

