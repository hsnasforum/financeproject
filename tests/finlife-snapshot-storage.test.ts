import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadFinlifeSnapshot,
  saveFinlifeSnapshot,
  saveFinlifeSyncAttempt,
  type FinlifeSnapshot,
} from "../src/lib/finlife/snapshot";

const tempRoots: string[] = [];

function makeSnapshot(code: string, generatedAt: string): FinlifeSnapshot {
  return {
    meta: {
      generatedAt,
      ttlMs: 43_200_000,
      groupsScanned: ["020000"],
      pagesFetchedByGroup: { "020000": 1 },
      totalProducts: 1,
      totalOptions: 0,
      completionRate: 1,
      truncatedByHardCap: false,
      source: "finlife",
    },
    items: [{ fin_prdt_cd: code, options: [], raw: {} }],
  };
}

function setupRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-finlife-snapshot-storage-"));
  tempRoots.push(root);
  vi.spyOn(process, "cwd").mockReturnValue(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("FINLIFE snapshot storage", () => {
  it("observes same-size external replacement, delete, and invalid JSON in one process", () => {
    const root = setupRoot();
    const file = path.join(root, ".data", "finlife_deposit_snapshot.json");
    const first = makeSnapshot("FIN-001", "2026-07-16T00:00:00.000Z");
    const second = makeSnapshot("FIN-002", "2026-07-16T00:00:01.000Z");
    saveFinlifeSnapshot("deposit", first);
    expect(loadFinlifeSnapshot("deposit")?.items[0]?.fin_prdt_cd).toBe("FIN-001");

    const firstRaw = JSON.stringify(first);
    const secondRaw = JSON.stringify(second);
    expect(secondRaw.length).toBe(firstRaw.length);
    const replacement = `${file}.external`;
    fs.writeFileSync(replacement, secondRaw, "utf-8");
    fs.renameSync(replacement, file);
    expect(loadFinlifeSnapshot("deposit")?.items[0]?.fin_prdt_cd).toBe("FIN-002");

    fs.rmSync(file, { force: true });
    expect(loadFinlifeSnapshot("deposit")).toBeNull();

    fs.writeFileSync(file, secondRaw, "utf-8");
    expect(loadFinlifeSnapshot("deposit")?.items[0]?.fin_prdt_cd).toBe("FIN-002");
    fs.writeFileSync(replacement, "{invalid-json", "utf-8");
    fs.renameSync(replacement, file);
    expect(loadFinlifeSnapshot("deposit")).toBeNull();
  });

  it("retries a read race and returns the newest stable FINLIFE snapshot", () => {
    const root = setupRoot();
    const file = path.join(root, ".data", "finlife_saving_snapshot.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const second = makeSnapshot("FIN-002", "2026-07-16T00:00:01.000Z");
    fs.writeFileSync(file, JSON.stringify(makeSnapshot("FIN-001", "2026-07-16T00:00:00.000Z")), "utf-8");
    const replacement = `${file}.external`;
    const realReadFileSync = fs.readFileSync.bind(fs);
    vi.spyOn(fs, "readFileSync").mockImplementationOnce(((target: fs.PathOrFileDescriptor) => {
      const raw = realReadFileSync(target, "utf-8");
      fs.writeFileSync(replacement, JSON.stringify(second), "utf-8");
      fs.renameSync(replacement, file);
      return raw;
    }) as typeof fs.readFileSync);

    expect(loadFinlifeSnapshot("saving")?.items[0]?.fin_prdt_cd).toBe("FIN-002");
  });

  it("returns null after the FINLIFE snapshot stays unstable for every bounded attempt", () => {
    const root = setupRoot();
    const file = path.join(root, ".data", "finlife_saving_snapshot.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(makeSnapshot("FIN-001", "2026-07-16T00:00:00.000Z")), "utf-8");
    const actual = fs.statSync(file);
    vi.spyOn(fs, "statSync")
      .mockReturnValueOnce({ ...actual, ino: actual.ino + 1 } as fs.Stats)
      .mockReturnValueOnce({ ...actual, ino: actual.ino + 2 } as fs.Stats)
      .mockReturnValueOnce({ ...actual, ino: actual.ino + 3 } as fs.Stats)
      .mockReturnValueOnce({ ...actual, ino: actual.ino + 4 } as fs.Stats)
      .mockReturnValueOnce({ ...actual, ino: actual.ino + 5 } as fs.Stats)
      .mockReturnValueOnce({ ...actual, ino: actual.ino + 6 } as fs.Stats);

    expect(loadFinlifeSnapshot("saving")).toBeNull();
  });

  it("avoids rereading FINLIFE snapshot bytes while disk identity matches", () => {
    setupRoot();
    saveFinlifeSnapshot("deposit", makeSnapshot("FIN-001", "2026-07-16T00:00:00.000Z"));
    const readSpy = vi.spyOn(fs, "readFileSync");

    expect(loadFinlifeSnapshot("deposit")?.items[0]?.fin_prdt_cd).toBe("FIN-001");
    expect(loadFinlifeSnapshot("deposit")?.items[0]?.fin_prdt_cd).toBe("FIN-001");
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it("uses unique operation-owned temp names for both runtime writers", () => {
    setupRoot();
    const writePaths: string[] = [];
    const realWriteFileSync = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation(((target: fs.PathOrFileDescriptor, data: string, options: BufferEncoding) => {
      writePaths.push(String(target));
      return realWriteFileSync(target, data, options);
    }) as typeof fs.writeFileSync);

    saveFinlifeSnapshot("deposit", makeSnapshot("FIN-001", "2026-07-16T00:00:00.000Z"));
    saveFinlifeSyncAttempt("deposit", {
      status: "running",
      phase: "db",
      startedAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });

    expect(writePaths).toHaveLength(2);
    expect(writePaths.every((file) => file.includes(`.tmp-${process.pid}-`))).toBe(true);
    expect(new Set(writePaths).size).toBe(2);
  });

  it("preserves the canonical snapshot and removes only its own temp after failure", () => {
    const root = setupRoot();
    const file = path.join(root, ".data", "finlife_deposit_snapshot.json");
    saveFinlifeSnapshot("deposit", makeSnapshot("FIN-001", "2026-07-16T00:00:00.000Z"));
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("rename failed");
    });

    expect(() => saveFinlifeSnapshot("deposit", makeSnapshot("FIN-002", "2026-07-16T00:00:01.000Z"))).toThrow("rename failed");
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).items[0]?.fin_prdt_cd).toBe("FIN-001");
    expect(fs.readdirSync(path.dirname(file)).filter((name) => name.startsWith(`${path.basename(file)}.tmp`))).toEqual([]);
  });
});
