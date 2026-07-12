import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getOrBuildSnapshot,
  getSnapshotOrNull,
  isSnapshotFresh,
  loadSnapshot,
  saveSnapshot,
} from "../src/lib/publicApis/benefitsSnapshot";
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

function tempFile(name: string): string {
  return path.join(os.tmpdir(), `finance-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

afterEach(() => {
  // no-op
});

describe("benefits snapshot", () => {
  it("saves and loads snapshot file", () => {
    const file = tempFile("snapshot-save-load");
    const snapshot = {
      meta: { generatedAt: new Date().toISOString(), totalItemsInSnapshot: 1 },
      items: [makeItem("a")],
    };
    saveSnapshot(file, snapshot);
    const loaded = loadSnapshot(file);
    expect(loaded?.items.length).toBe(1);
    expect(loaded?.meta.totalItemsInSnapshot).toBe(1);
    fs.rmSync(file, { force: true });
  });

  it("rebuilds when ttl is expired", async () => {
    const file = tempFile("snapshot-ttl");
    const stale = {
      meta: { generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), totalItemsInSnapshot: 1 },
      items: [makeItem("old")],
    };
    saveSnapshot(file, stale);
    expect(isSnapshotFresh(stale.meta.generatedAt, 60_000)).toBe(false);

    let buildCount = 0;
    const built = await getOrBuildSnapshot({
      filePath: file,
      ttlMs: 60_000,
      build: async () => {
        buildCount += 1;
        return {
          items: [makeItem("new")],
          meta: { uniqueCount: 1 },
        };
      },
    });

    expect(buildCount).toBe(1);
    expect(built.fromCache).toBe("built");
    expect(built.snapshot.items[0]?.id).toBe("new");
    fs.rmSync(file, { force: true });
  });

  it("reloads an atomic snapshot replacement written by an external CLI process", () => {
    const file = tempFile("snapshot-external-replace");
    const first = {
      meta: { generatedAt: "2026-07-11T00:00:00.000Z", totalItemsInSnapshot: 1 },
      items: [makeItem("old")],
    };
    saveSnapshot(file, first);
    expect(getSnapshotOrNull({ filePath: file })?.snapshot.items[0]?.id).toBe("old");
    expect(getSnapshotOrNull({ filePath: file })?.fromCache).toBe("memory");

    const next = {
      meta: { generatedAt: "2026-07-12T00:00:00.000Z", totalItemsInSnapshot: 2 },
      items: [makeItem("new-a"), makeItem("new-b")],
    };
    const externalTemp = `${file}.external.tmp`;
    fs.writeFileSync(externalTemp, JSON.stringify(next), "utf8");
    fs.renameSync(externalTemp, file);

    const reloaded = getSnapshotOrNull({ filePath: file });
    expect(reloaded?.fromCache).toBe("disk");
    expect(reloaded?.snapshot.meta.generatedAt).toBe("2026-07-12T00:00:00.000Z");
    expect(reloaded?.snapshot.items.map((item) => item.id)).toEqual(["new-a", "new-b"]);
    fs.rmSync(file, { force: true });
  });

  it("does not serve stale memory after the snapshot file is removed", () => {
    const file = tempFile("snapshot-external-delete");
    saveSnapshot(file, {
      meta: { generatedAt: new Date().toISOString(), totalItemsInSnapshot: 1 },
      items: [makeItem("cached")],
    });
    expect(getSnapshotOrNull({ filePath: file })?.fromCache).toBe("memory");

    fs.rmSync(file, { force: true });
    expect(getSnapshotOrNull({ filePath: file })).toBeNull();
  });
});
