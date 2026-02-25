import { describe, expect, it } from "vitest";
import { summarizeFreshness, type FreshnessSourceSpec } from "../src/components/data/freshness";
import { type SourceStatusRow } from "../src/lib/sources/types";

const specs: FreshnessSourceSpec[] = [
  { sourceId: "finlife", kind: "deposit", label: "FINLIFE 예금", importance: "required" },
  { sourceId: "datago_kdb", kind: "deposit", label: "KDB", importance: "optional" },
];

function row(input: Partial<SourceStatusRow> & Pick<SourceStatusRow, "sourceId" | "kind">): SourceStatusRow {
  return {
    sourceId: input.sourceId,
    kind: input.kind,
    lastSyncedAt: input.lastSyncedAt ?? "2026-02-24T00:00:00.000Z",
    ttlMs: input.ttlMs ?? 43_200_000,
    ageMs: input.ageMs ?? 1000,
    isFresh: input.isFresh ?? true,
    counts: input.counts ?? 1,
    ...(input.lastError ? { lastError: input.lastError } : {}),
    ...(input.lastRun ? { lastRun: input.lastRun } : {}),
    ...(input.lastAttemptAt ? { lastAttemptAt: input.lastAttemptAt } : {}),
  };
}

describe("summarizeFreshness", () => {
  it("returns ok when required sources are fresh", () => {
    const summary = summarizeFreshness(
      [
        row({ sourceId: "finlife", kind: "deposit", isFresh: true, counts: 100 }),
        row({ sourceId: "datago_kdb", kind: "deposit", isFresh: true, counts: 1000 }),
      ],
      specs,
    );

    expect(summary.level).toBe("ok");
    expect(summary.requiredIssuesCount).toBe(0);
    expect(summary.optionalIssuesCount).toBe(0);
  });

  it("returns info when optional source is stale", () => {
    const summary = summarizeFreshness(
      [
        row({ sourceId: "finlife", kind: "deposit", isFresh: true, counts: 100 }),
        row({ sourceId: "datago_kdb", kind: "deposit", isFresh: false, counts: 1000 }),
      ],
      specs,
    );

    expect(summary.level).toBe("info");
    expect(summary.requiredIssuesCount).toBe(0);
    expect(summary.optionalIssuesCount).toBe(1);
  });

  it("returns warn in strict mode when optional source is stale", () => {
    const summary = summarizeFreshness(
      [
        row({ sourceId: "finlife", kind: "deposit", isFresh: true, counts: 100 }),
        row({ sourceId: "datago_kdb", kind: "deposit", isFresh: false, counts: 1000 }),
      ],
      specs,
      { strict: true },
    );

    expect(summary.level).toBe("warn");
    expect(summary.requiredIssuesCount).toBe(1);
    expect(summary.optionalIssuesCount).toBe(0);
  });

  it("returns error when required source has lastError", () => {
    const summary = summarizeFreshness(
      [
        row({
          sourceId: "finlife",
          kind: "deposit",
          isFresh: false,
          counts: 0,
          lastError: { at: "2026-02-24T01:00:00.000Z", message: "timeout" },
        }),
        row({
          sourceId: "datago_kdb",
          kind: "deposit",
          isFresh: true,
          counts: 100,
        }),
      ],
      specs,
    );

    expect(summary.level).toBe("error");
    expect(summary.items.find((item) => item.sourceId === "finlife")?.reason).toContain("실패");
  });
});
