import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getSnapshotOrNull, saveSnapshot } from "../src/lib/publicApis/benefitsSnapshot";
import { type BenefitCandidate } from "../src/lib/publicApis/contracts/types";

function makeItem(id: string): BenefitCandidate {
  return {
    id,
    title: `title-${id}`,
    summary: "summary",
    eligibilityHints: ["hint"],
    region: { scope: "NATIONWIDE", tags: ["전국"] },
    source: "test",
    fetchedAt: new Date().toISOString(),
  };
}

describe("benefits snapshot no autorebuild", () => {
  it("returns stale snapshot without invoking rebuild path", () => {
    const file = path.join(os.tmpdir(), `benefits-stale-${Date.now()}.json`);
    saveSnapshot(file, {
      meta: { generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), totalItemsInSnapshot: 1 },
      items: [makeItem("stale")],
    });

    const rebuildSpy = vi.fn();
    const snap = getSnapshotOrNull({ filePath: file, ttlMs: 60_000 });
    expect(snap).not.toBeNull();
    expect(snap?.isStale).toBe(true);
    expect(snap?.snapshot.items[0]?.id).toBe("stale");
    expect(rebuildSpy).not.toHaveBeenCalled();
    fs.rmSync(file, { force: true });
  });
});

