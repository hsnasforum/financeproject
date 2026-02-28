import { describe, expect, it } from "vitest";
import { computeStats, pickTop } from "../src/lib/feedback/feedbackStats";

const rows = [
  { id: "a", status: "OPEN" as const, createdAt: "2026-02-27T10:00:00.000Z" },
  { id: "b", status: "DOING" as const, createdAt: "2026-02-27T10:05:00.000Z" },
  { id: "c", status: "DONE" as const, createdAt: "2026-02-27T09:00:00.000Z" },
  { id: "d", status: "OPEN" as const, createdAt: "2026-02-27T11:00:00.000Z" },
  { id: "e", status: "DOING" as const, createdAt: "2026-02-27T11:30:00.000Z" },
];

describe("feedback stats", () => {
  it("computes OPEN/DOING/DONE counts", () => {
    const stats = computeStats(rows);
    expect(stats).toEqual({
      OPEN: 2,
      DOING: 2,
      DONE: 1,
      total: 5,
    });
  });

  it("picks top by latest createdAt", () => {
    const top = pickTop(rows, { limit: 3 });
    expect(top.map((row) => row.id)).toEqual(["e", "d", "b"]);
  });

  it("picks top with status filter", () => {
    const top = pickTop(rows, { statuses: ["OPEN", "DOING"], limit: 5 });
    expect(top.map((row) => row.id)).toEqual(["e", "d", "b", "a"]);
  });
});

