import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
  listAssumptionsHistory,
  saveAssumptionsSnapshotToHistory,
  setLatestSnapshotFromHistory,
} from "../../src/lib/planning/assumptions/storage";
import { type AssumptionsSnapshot } from "../../src/lib/planning/assumptions/types";

function makeSnapshot(input: Partial<AssumptionsSnapshot>): AssumptionsSnapshot {
  return {
    version: 1,
    asOf: input.asOf ?? "2026-02-28",
    fetchedAt: input.fetchedAt ?? "2026-02-28T12:00:00.000Z",
    korea: input.korea ?? {},
    sources: input.sources ?? [],
    warnings: input.warnings ?? [],
  };
}

describe("assumptions storage history", () => {
  const originalLatestPath = process.env.PLANNING_ASSUMPTIONS_PATH;
  const originalHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "planning-assumptions-history-"));
    process.env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "assumptions.latest.json");
    process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, "history");
  });

  afterEach(() => {
    if (typeof originalLatestPath === "string") process.env.PLANNING_ASSUMPTIONS_PATH = originalLatestPath;
    else delete process.env.PLANNING_ASSUMPTIONS_PATH;

    if (typeof originalHistoryDir === "string") process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalHistoryDir;
    else delete process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("saves snapshots to history, lists refs, and loads by id", async () => {
    const s1 = makeSnapshot({
      asOf: "2026-01-31",
      fetchedAt: "2026-01-31T09:00:00.000Z",
      korea: { policyRatePct: 2.5 },
    });
    const s2 = makeSnapshot({
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T09:00:00.000Z",
      korea: { policyRatePct: 2.75 },
    });

    const saved1 = await saveAssumptionsSnapshotToHistory(s1);
    const saved2 = await saveAssumptionsSnapshotToHistory(s2);

    const listed = await listAssumptionsHistory(10);
    expect(listed.length).toBe(2);
    expect(listed.map((entry) => entry.id)).toContain(saved1.id);
    expect(listed.map((entry) => entry.id)).toContain(saved2.id);

    const loaded = await loadAssumptionsSnapshotById(saved2.id);
    expect(loaded?.asOf).toBe("2026-02-28");
    expect(loaded?.korea.policyRatePct).toBe(2.75);
  });

  it("adds numeric suffix when snapshot id collides", async () => {
    const snapshot = makeSnapshot({
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T09:00:00.000Z",
    });

    const first = await saveAssumptionsSnapshotToHistory(snapshot);
    const second = await saveAssumptionsSnapshotToHistory(snapshot);
    const third = await saveAssumptionsSnapshotToHistory(snapshot);

    expect(first.id).toBe("2026-02-28_2026-02-28-09-00-00");
    expect(second.id).toBe("2026-02-28_2026-02-28-09-00-00-2");
    expect(third.id).toBe("2026-02-28_2026-02-28-09-00-00-3");
  });

  it("sets latest snapshot from history id", async () => {
    const older = makeSnapshot({
      asOf: "2026-01-31",
      fetchedAt: "2026-01-31T09:00:00.000Z",
      korea: { policyRatePct: 2.5 },
    });
    const newer = makeSnapshot({
      asOf: "2026-02-28",
      fetchedAt: "2026-02-28T09:00:00.000Z",
      korea: { policyRatePct: 2.75 },
    });
    const olderSaved = await saveAssumptionsSnapshotToHistory(older);
    const newerSaved = await saveAssumptionsSnapshotToHistory(newer);

    await setLatestSnapshotFromHistory(olderSaved.id);
    expect((await loadLatestAssumptionsSnapshot())?.korea.policyRatePct).toBe(2.5);

    await setLatestSnapshotFromHistory(newerSaved.id);
    expect((await loadLatestAssumptionsSnapshot())?.korea.policyRatePct).toBe(2.75);
  });

  it("skips truncated history files when listing snapshots", async () => {
    const valid = makeSnapshot({
      asOf: "2026-03-31",
      fetchedAt: "2026-03-31T09:00:00.000Z",
      korea: { policyRatePct: 3.0 },
    });
    const saved = await saveAssumptionsSnapshotToHistory(valid);
    fs.writeFileSync(path.join(root, "history", "broken.json"), "{\n", "utf-8");

    const listed = await listAssumptionsHistory(10);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(saved.id);
  });
});
