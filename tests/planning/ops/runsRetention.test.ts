import { describe, expect, it } from "vitest";
import { planRunsRetention } from "../../../src/lib/ops/runsRetention";

function iso(daysAgo: number): string {
  const now = Date.parse("2026-03-01T00:00:00.000Z");
  return new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

describe("planRunsRetention", () => {
  it("removes records over keepCount by newest-first ordering", () => {
    const rows = [
      { id: "r1", profileId: "p1", createdAt: iso(1) },
      { id: "r2", profileId: "p1", createdAt: iso(2) },
      { id: "r3", profileId: "p1", createdAt: iso(3) },
    ];

    const plan = planRunsRetention(rows, { keepCount: 2, nowIso: "2026-03-01T00:00:00.000Z" });

    expect(plan.total).toBe(3);
    expect(plan.kept).toBe(2);
    expect(plan.remove.map((row) => row.id)).toEqual(["r3"]);
    expect(plan.remove[0]?.reasons).toContain("KEEP_COUNT");
  });

  it("removes records older than keepDays", () => {
    const rows = [
      { id: "fresh", profileId: "p1", createdAt: iso(5) },
      { id: "old", profileId: "p1", createdAt: iso(120) },
    ];

    const plan = planRunsRetention(rows, { keepDays: 30, nowIso: "2026-03-01T00:00:00.000Z" });

    expect(plan.remove.map((row) => row.id)).toEqual(["old"]);
    expect(plan.remove[0]?.reasons).toContain("KEEP_DAYS");
  });

  it("dedupes same run when both keepCount and keepDays match", () => {
    const rows = [
      { id: "new", profileId: "p1", createdAt: iso(1) },
      { id: "old", profileId: "p1", createdAt: iso(100) },
    ];

    const plan = planRunsRetention(rows, {
      keepCount: 1,
      keepDays: 30,
      nowIso: "2026-03-01T00:00:00.000Z",
    });

    expect(plan.remove).toHaveLength(1);
    expect(plan.remove[0]?.id).toBe("old");
    expect(plan.remove[0]?.reasons.sort()).toEqual(["KEEP_COUNT", "KEEP_DAYS"]);
  });

  it("applies profile filter", () => {
    const rows = [
      { id: "p1-old", profileId: "p1", createdAt: iso(100) },
      { id: "p2-old", profileId: "p2", createdAt: iso(100) },
    ];

    const plan = planRunsRetention(rows, {
      keepDays: 30,
      profileId: "p1",
      nowIso: "2026-03-01T00:00:00.000Z",
    });

    expect(plan.total).toBe(1);
    expect(plan.remove.map((row) => row.id)).toEqual(["p1-old"]);
  });
});
