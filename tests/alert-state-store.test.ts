import { describe, expect, it } from "vitest";
import {
  applyState,
  emptyAlertState,
  markRead,
  muteCluster,
  togglePin,
  type AlertStateInputItem,
} from "../src/lib/dart/alertStateStore";

describe("alert state store", () => {
  it("updates read/pin/mute maps", () => {
    const base = emptyAlertState();
    const read = markRead("item-a", base, "2026-02-26T10:00:00.000Z");
    expect(read.read["item-a"]).toBe("2026-02-26T10:00:00.000Z");

    const pinned = togglePin("item-a", read, "2026-02-26T10:01:00.000Z");
    expect(pinned.pinned["item-a"]).toBe("2026-02-26T10:01:00.000Z");

    const unpinned = togglePin("item-a", pinned);
    expect(unpinned.pinned["item-a"]).toBeUndefined();

    const muted = muteCluster("corp::cluster", unpinned, "2026-02-26T10:02:00.000Z");
    expect(muted.mutedClusters["corp::cluster"]).toBe("2026-02-26T10:02:00.000Z");
  });

  it("applies mute/pin/read rules with deterministic ordering", () => {
    const items: AlertStateInputItem[] = [
      { id: "p-old", clusterKey: "c1", title: "핀 오래됨", clusterScore: 70, date: "20260201", isNew: true },
      { id: "p-new", clusterKey: "c2", title: "핀 최신", clusterScore: 10, date: "20260202", isNew: true },
      { id: "u-high-old", clusterKey: "c3", title: "일반 높은점수(오래됨)", clusterScore: 95, date: "20260201", isNew: true },
      { id: "u-high-new", clusterKey: "c4", title: "일반 높은점수(최신)", clusterScore: 95, date: "20260203", isNew: true },
      { id: "u-muted", clusterKey: "c5", title: "무시 대상", clusterScore: 99, date: "20260204", isNew: true },
    ];

    const state = {
      read: { "u-high-new": "2026-02-26T11:00:00.000Z" },
      pinned: {
        "p-old": "2026-02-25T10:00:00.000Z",
        "p-new": "2026-02-26T10:00:00.000Z",
      },
      mutedClusters: { c5: "2026-02-26T12:00:00.000Z" },
    };

    const applied = applyState(items, state);
    expect(applied.map((item) => item.id)).toEqual(["p-new", "p-old", "u-high-new", "u-high-old"]);

    expect(applied.find((item) => item.id === "u-high-new")?.showNewBadge).toBe(false);
    expect(applied.find((item) => item.id === "u-high-new")?.isRead).toBe(true);
    expect(applied.find((item) => item.id === "u-high-old")?.showNewBadge).toBe(true);
    expect(applied.find((item) => item.id === "u-muted")).toBeUndefined();
  });
});
