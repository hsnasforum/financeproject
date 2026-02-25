import { describe, expect, it } from "vitest";
import { aggregateProbeResults } from "../src/lib/finlife/probeGroups";

describe("finlife probe aggregate", () => {
  it("aggregates valid groups and returns sorted union recommendation", () => {
    const result = aggregateProbeResults(
      [
        { kind: "deposit", group: "030000", hasData: true, totalCount: 11 },
        { kind: "deposit", group: "020000", hasData: true, totalCount: 99 },
        { kind: "saving", group: "020000", hasData: true, totalCount: 30 },
        { kind: "saving", group: "040000", hasData: true, totalCount: 1 },
        { kind: "saving", group: "050000", hasData: false },
      ],
      [{ kind: "deposit", group: "060000", status: 500, code: "FETCH_FAILED" }],
    );

    expect(result.validByKind.deposit).toEqual(["020000", "030000"]);
    expect(result.validByKind.saving).toEqual(["020000", "040000"]);
    expect(result.recommendedGroups).toEqual(["020000", "030000", "040000"]);
    expect(result.countsByKindAndGroup.deposit["020000"]).toBe(99);
    expect(result.failures).toHaveLength(1);
  });
});
