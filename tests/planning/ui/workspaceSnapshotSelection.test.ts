import { describe, expect, it } from "vitest";
import {
  buildWorkspaceSnapshotItemsStateFromApi,
  isSameWorkspaceSnapshotSelection,
  normalizeWorkspaceSnapshotSelection,
  parseWorkspaceSnapshotListItem,
  resolveInitialWorkspaceSnapshotSelection,
  resolveWorkspaceSelectedSnapshotItem,
  resolveWorkspaceSnapshotSelectionFallback,
  sortWorkspaceSnapshotHistory,
} from "../../../src/app/planning/_lib/workspaceSnapshotSelection";

describe("workspaceSnapshotSelection", () => {
  it("parses snapshot list item with trimmed strings and numeric fields", () => {
    expect(parseWorkspaceSnapshotListItem({
      id: " snap-1 ",
      asOf: " 2026-03-01 ",
      fetchedAt: "2026-03-02T00:00:00.000Z",
      staleDays: "7",
      warningsCount: "2",
      korea: {
        policyRatePct: "3.25",
        cpiYoYPct: 2.1,
      },
    })).toEqual({
      id: "snap-1",
      asOf: "2026-03-01",
      fetchedAt: "2026-03-02T00:00:00.000Z",
      staleDays: 7,
      warningsCount: 2,
      korea: {
        policyRatePct: 3.25,
        cpiYoYPct: 2.1,
      },
    });
  });

  it("builds snapshot items state from api payload and sorts history by fetchedAt desc", () => {
    const state = buildWorkspaceSnapshotItemsStateFromApi({
      latest: {
        id: "latest",
        fetchedAt: "2026-03-03T00:00:00.000Z",
        korea: {
          policyRatePct: 3.0,
        },
      },
      items: [
        {
          id: "snap-a",
          fetchedAt: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "snap-c",
          fetchedAt: "2026-03-02T00:00:00.000Z",
        },
        {
          id: "snap-b",
          fetchedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
    });

    expect(state.latest?.id).toBe("latest");
    expect(state.latest?.korea?.policyRatePct).toBe(3.0);
    expect(state.history.map((item) => item.id)).toEqual(["snap-c", "snap-b", "snap-a"]);
  });

  it("resolves initial selection to latest first and history fallback otherwise", () => {
    expect(resolveInitialWorkspaceSnapshotSelection({
      latest: { id: "latest" },
      history: [{ id: "snap-1" }],
    })).toEqual({ mode: "latest" });

    expect(resolveInitialWorkspaceSnapshotSelection({
      history: [{ id: "snap-1" }, { id: "snap-2" }],
    })).toEqual({ mode: "history", id: "snap-1" });
  });

  it("normalizes missing history selection back to initial selection", () => {
    const items = {
      latest: { id: "latest" },
      history: [{ id: "snap-2" }, { id: "snap-1" }],
    };

    expect(normalizeWorkspaceSnapshotSelection(items, { mode: "history", id: "missing" })).toEqual({ mode: "latest" });
    expect(normalizeWorkspaceSnapshotSelection(items, { mode: "history", id: "snap-1" })).toEqual({ mode: "history", id: "snap-1" });
  });

  it("resolves selected snapshot item from normalized selection", () => {
    const items = {
      latest: { id: "latest" },
      history: [{ id: "snap-2" }, { id: "snap-1" }],
    };

    expect(resolveWorkspaceSelectedSnapshotItem(items, { mode: "latest" })?.id).toBe("latest");
    expect(resolveWorkspaceSelectedSnapshotItem(items, { mode: "history", id: "snap-1" })?.id).toBe("snap-1");
  });

  it("maps SNAPSHOT_NOT_FOUND into latest fallback selection", () => {
    expect(resolveWorkspaceSnapshotSelectionFallback("SNAPSHOT_NOT_FOUND")).toEqual({ mode: "latest" });
    expect(resolveWorkspaceSnapshotSelectionFallback(" snapshot_not_found ")).toEqual({ mode: "latest" });
    expect(resolveWorkspaceSnapshotSelectionFallback("OTHER")).toBeNull();
  });

  it("compares snapshot selections by mode and id", () => {
    expect(isSameWorkspaceSnapshotSelection({ mode: "latest" }, { mode: "latest" })).toBe(true);
    expect(isSameWorkspaceSnapshotSelection({ mode: "history", id: "snap-1" }, { mode: "history", id: "snap-1" })).toBe(true);
    expect(isSameWorkspaceSnapshotSelection({ mode: "history", id: "snap-1" }, { mode: "history", id: "snap-2" })).toBe(false);
  });

  it("sorts snapshot history by fetchedAt desc then id desc", () => {
    const sorted = sortWorkspaceSnapshotHistory([
      { id: "snap-a", fetchedAt: "2026-03-01T00:00:00.000Z" },
      { id: "snap-c", fetchedAt: "2026-03-02T00:00:00.000Z" },
      { id: "snap-b", fetchedAt: "2026-03-02T00:00:00.000Z" },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["snap-c", "snap-b", "snap-a"]);
  });
});
