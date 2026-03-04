import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { encodeZip } from "../../../src/lib/ops/backup/zipCodec";
import { runV3Restore } from "./restore";

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
    })).rejects.toThrow("RESTORE_BLOCKED:VALIDATION_FAILED");
  });

  it("backs up existing .data then restores and runs doctor in apply mode", async () => {
    const root = createRoot();
    writeText(path.join(root, ".data/news/items/old.json"), JSON.stringify({
      id: "old",
      sourceId: "source-old",
      title: "old",
      url: "https://example.com/old",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    }));

    const archivePath = path.join(root, "tmp", "good.zip");
    makeArchive(archivePath, [
      {
        path: ".data/news/items/new.json",
        text: JSON.stringify({
          id: "new",
          sourceId: "source-a",
          title: "new",
          url: "https://example.com/new",
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
      {
        path: ".data/exposure/profile.json",
        text: JSON.stringify({
          debt: {
            hasDebt: "unknown",
            rateType: "unknown",
            repricingHorizon: "unknown",
          },
          inflation: {
            essentialExpenseShare: "unknown",
            rentOrMortgageShare: "unknown",
            energyShare: "unknown",
          },
          fx: {
            foreignConsumption: "unknown",
            foreignIncome: "unknown",
          },
          income: {
            incomeStability: "unknown",
          },
          liquidity: {
            monthsOfCashBuffer: "unknown",
          },
        }),
      },
    ]);

    const summary = await runV3Restore({
      cwd: root,
      archivePath,
      apply: true,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(summary.mode).toBe("apply");
    expect(summary.totals.errors).toBe(0);
    expect(summary.totals.restoredFiles).toBe(3);
    expect(summary.backupPath).toBeTruthy();
    expect(summary.doctor).toBeDefined();

    expect(fs.existsSync(path.join(root, ".data/news/items/new.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".data/news/items/old.json"))).toBe(false);
    expect(fs.existsSync(path.join(summary.backupPath!, "news/items/old.json"))).toBe(true);
  });
});
