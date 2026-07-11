import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { encodeZip } from "../../../src/lib/ops/backup/zipCodec";
import {
  runV3Restore,
  V3_RESTORE_APPLY_DISABLED_CODE,
} from "./restore";

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function makeArchive(filePath: string, entries: Array<{ path: string; text: string }>): void {
  const bytes = encodeZip(entries.map((entry) => ({
    path: entry.path,
    bytes: Buffer.from(entry.text, "utf-8"),
  })));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("planning v3 restore cli", () => {
  const roots: string[] = [];

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-restore-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs dry-run validation without mutating local .data", async () => {
    const root = createRoot();
    const archivePath = path.join(root, "tmp", "backup.zip");
    makeArchive(archivePath, [
      {
        path: ".data/news/items/item-1.json",
        text: JSON.stringify({
          id: "item-1",
          sourceId: "source-a",
          title: "샘플 뉴스",
          url: "https://example.com/news/1",
          publishedAt: "2026-03-04T00:00:00.000Z",
          guid: "guid-1",
          snippet: "요약",
          fetchedAt: "2026-03-04T00:10:00.000Z",
        }),
      },
      {
        path: ".data/news/state.json",
        text: JSON.stringify({
          lastRunAt: "2026-03-04T00:10:00.000Z",
          sources: {},
        }),
      },
    ]);

    const summary = await runV3Restore({
      cwd: root,
      archivePath,
      apply: false,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(summary.mode).toBe("preview");
    expect(summary.totals.errors).toBe(0);
    expect(summary.totals.entries).toBe(2);
    expect(summary.totals.restoredFiles).toBe(0);
    expect(fs.existsSync(path.join(root, ".data/news/items/item-1.json"))).toBe(false);
  });

  it("blocks restore on schema validation failure", async () => {
    const root = createRoot();
    const archivePath = path.join(root, "tmp", "bad.zip");
    makeArchive(archivePath, [
      {
        path: ".data/news/items/bad.json",
        text: JSON.stringify({ id: "bad" }),
      },
    ]);

    const preview = await runV3Restore({
      cwd: root,
      archivePath,
      apply: false,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(preview.totals.errors).toBeGreaterThan(0);
    expect(preview.issues.some((row) => row.code === "SCHEMA_INVALID")).toBe(true);

    await expect(runV3Restore({
      cwd: root,
      archivePath,
      apply: true,
      now: new Date("2026-03-04T00:00:00.000Z"),
    })).rejects.toMatchObject({
      name: "V3RestoreApplyDisabledError",
      code: V3_RESTORE_APPLY_DISABLED_CODE,
    });
  });

  it("blocks apply before archive reads or data-root mutation", async () => {
    const root = createRoot();
    const existingDataPath = path.join(root, ".data/news/items/old.json");
    const canonicalV3Path = path.join(root, ".data/planning-v3/accounts.json");
    const planningDataDir = path.join(root, "runtime-planning-data");
    const stablePlanningPath = path.join(planningDataDir, "users/user-a/runs/run-1.json");
    const archivePath = path.join(root, "tmp", "blocked-apply.zip");

    writeText(existingDataPath, JSON.stringify({
      id: "old",
      sourceId: "source-old",
      title: "old",
      url: "https://example.com/old",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    }));
    writeText(canonicalV3Path, JSON.stringify({ accounts: [{ id: "account-1" }] }));
    writeText(stablePlanningPath, JSON.stringify({ id: "run-1", userId: "user-a" }));
    writeText(archivePath, "not-a-zip");

    const checksums = new Map([
      [existingDataPath, sha256(existingDataPath)],
      [canonicalV3Path, sha256(canonicalV3Path)],
      [stablePlanningPath, sha256(stablePlanningPath)],
      [archivePath, sha256(archivePath)],
    ]);
    const previousPlanningDataDir = process.env.PLANNING_DATA_DIR;
    process.env.PLANNING_DATA_DIR = planningDataDir;

    try {
      await expect(runV3Restore({
        cwd: root,
        archivePath,
        apply: true,
        now: new Date("2026-03-04T00:00:00.000Z"),
      })).rejects.toMatchObject({
        name: "V3RestoreApplyDisabledError",
        code: V3_RESTORE_APPLY_DISABLED_CODE,
        message: "owner-aware staged restore가 준비될 때까지 --apply는 비활성 상태입니다.",
      });

      for (const [filePath, checksum] of checksums) {
        expect(sha256(filePath)).toBe(checksum);
      }

      expect(fs.readdirSync(root).some((name) => name.startsWith(".data.bak-"))).toBe(false);
      expect(fs.existsSync(path.join(root, ".data/news/items/new.json"))).toBe(false);
    } finally {
      if (previousPlanningDataDir === undefined) {
        delete process.env.PLANNING_DATA_DIR;
      } else {
        process.env.PLANNING_DATA_DIR = previousPlanningDataDir;
      }
    }
  });

  it("returns a stable non-zero CLI error without mutating the temporary data roots", () => {
    const root = createRoot();
    const existingDataPath = path.join(root, ".data/news/items/old.json");
    const planningDataDir = path.join(root, "runtime-planning-data");
    const stablePlanningPath = path.join(planningDataDir, "users/user-a/runs/run-1.json");
    const archivePath = path.join(root, "tmp", "blocked-cli-apply.zip");
    const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const restoreEntrypoint = path.join(repositoryRoot, "src/lib/planning/v3/ops/restore.ts");
    const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));

    writeText(existingDataPath, JSON.stringify({ id: "old" }));
    writeText(stablePlanningPath, JSON.stringify({ id: "run-1", userId: "user-a" }));
    writeText(archivePath, "not-a-zip");

    const checksums = new Map([
      [existingDataPath, sha256(existingDataPath)],
      [stablePlanningPath, sha256(stablePlanningPath)],
      [archivePath, sha256(archivePath)],
    ]);

    const result = spawnSync(process.execPath, [
      tsxCli,
      "--tsconfig",
      path.join(repositoryRoot, "tsconfig.json"),
      restoreEntrypoint,
      `--in=${archivePath}`,
      "--apply",
    ], {
      cwd: root,
      encoding: "utf-8",
      env: {
        ...process.env,
        PLANNING_DATA_DIR: planningDataDir,
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`[v3:restore] code=${V3_RESTORE_APPLY_DISABLED_CODE}`);
    expect(result.stdout).toBe("");

    for (const [filePath, checksum] of checksums) {
      expect(sha256(filePath)).toBe(checksum);
    }
    expect(fs.readdirSync(root).some((name) => name.startsWith(".data.bak-"))).toBe(false);
  });
});
