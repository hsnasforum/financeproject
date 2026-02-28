import { describe, expect, it } from "vitest";
import { buildOpsBriefSummary } from "../src/lib/ops/opsBriefSummary";

describe("ops brief summary", () => {
  it("selects only OPS + P0 + OPEN/DOING items", () => {
    const summary = buildOpsBriefSummary([
      {
        id: "ops-open",
        status: "OPEN",
        priority: "P0",
        message: "[OPS][SEED_DEBUG] 실패: DB_NOT_READY",
        tags: ["ops", "auto", "fix", "SEED_DEBUG"],
        createdAt: "2026-02-27T10:00:00.000Z",
      },
      {
        id: "ops-doing",
        status: "DOING",
        priority: "P0",
        message: "[OPS][FULL_REPAIR] 실패: UPSTREAM_UNAVAILABLE",
        tags: ["ops", "FULL_REPAIR"],
        createdAt: "2026-02-27T09:00:00.000Z",
      },
      {
        id: "not-p0",
        status: "OPEN",
        priority: "P1",
        message: "[OPS][SEED_DEBUG] 실패: DB_NOT_READY",
        tags: ["ops"],
        createdAt: "2026-02-27T08:00:00.000Z",
      },
      {
        id: "not-ops",
        status: "OPEN",
        priority: "P0",
        message: "일반 이슈",
        tags: ["ui"],
        createdAt: "2026-02-27T07:00:00.000Z",
      },
    ]);

    expect(summary.lines).toHaveLength(2);
    expect(summary.lines[0]).toContain("/feedback/ops-open");
    expect(summary.lines[1]).toContain("/feedback/ops-doing");
  });

  it("caps lines to at most 3", () => {
    const rows = Array.from({ length: 6 }, (_, idx) => ({
      id: `ops-${idx}`,
      status: "OPEN",
      priority: "P0",
      message: `[OPS][SEED_DEBUG] 실패: DB_NOT_READY #${idx}`,
      tags: ["ops", "SEED_DEBUG"],
      createdAt: `2026-02-27T0${idx}:00:00.000Z`,
    }));

    const summary = buildOpsBriefSummary(rows);
    expect(summary.lines).toHaveLength(3);
  });

  it("formats traceId when present and omits when absent", () => {
    const summary = buildOpsBriefSummary([
      {
        id: "with-trace",
        status: "OPEN",
        priority: "P0",
        message: "[OPS][SEED_DEBUG] 실패: DB_NOT_READY",
        tags: ["ops", "SEED_DEBUG"],
        traceId: "trace-123",
        createdAt: "2026-02-27T10:00:00.000Z",
      },
      {
        id: "without-trace",
        status: "OPEN",
        priority: "P0",
        message: "[OPS][FULL_REPAIR] 실패: UPSTREAM_UNAVAILABLE",
        tags: ["ops", "FULL_REPAIR"],
        createdAt: "2026-02-27T09:00:00.000Z",
      },
    ]);

    expect(summary.lines[0]).toContain("(traceId: trace-123)");
    expect(summary.lines[1]).not.toContain("traceId:");
  });
});
