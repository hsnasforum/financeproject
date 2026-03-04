import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeZip } from "../../../src/lib/ops/backup/zipCodec";
import { buildV3ExportPlan, runV3Export } from "./export";

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

describe("planning v3 export cli", () => {
  const roots: string[] = [];

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-export-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds summary first, then writes a single zip archive from whitelisted v3 data", async () => {
    const root = createRoot();

    const newsItemPath = path.join(root, ".data/news/items/item-1.json");
    writeText(newsItemPath, JSON.stringify({ id: "item-1", title: "sample" }));
    writeText(path.join(root, ".data/indicators/series/kr_cpi.jsonl"), `${JSON.stringify({ date: "2026-03", value: 114.2 })}\n`);
    writeText(path.join(root, ".data/exposure/profile.json"), JSON.stringify({ debt: { hasDebt: true } }));

    // these files must not be archived
    writeText(path.join(root, ".data/news/.env.local"), "SECRET=1\n");
    writeText(path.join(root, ".data/alerts/api_key.txt"), "abc123\n");

    const outputPath = path.join(root, ".data/exports/test.zip");
    const plan = buildV3ExportPlan({
      cwd: root,
      out: outputPath,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });

    expect(plan.totals.scannedFiles).toBe(5);
    expect(plan.totals.exportedFiles).toBe(3);
    expect(plan.totals.skippedFiles).toBe(2);
    expect(fs.existsSync(outputPath)).toBe(false);

    const beforeNewsItem = fs.readFileSync(newsItemPath, "utf-8");
    const result = runV3Export({
      cwd: root,
      out: outputPath,
      now: new Date("2026-03-04T00:00:00.000Z"),
    });
    const afterNewsItem = fs.readFileSync(newsItemPath, "utf-8");

    expect(result.archivePath).toBe(outputPath);
    expect(result.archiveBytes).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(beforeNewsItem).toBe(afterNewsItem);

    const archiveBytes = fs.readFileSync(outputPath);
    const entries = await decodeZip(archiveBytes, {
      maxEntries: 100,
      maxTotalBytes: 1024 * 1024,
    });

    const names = [...entries.keys()].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual([
      ".data/exposure/profile.json",
      ".data/indicators/series/kr_cpi.jsonl",
      ".data/news/items/item-1.json",
    ]);
  });
});
