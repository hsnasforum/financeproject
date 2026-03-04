import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readNewsBrief } from "../src/lib/news/briefReader";

let tmpDir = "";

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = "";
});

describe("news brief reader", () => {
  it("returns null when file is missing", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-brief-reader-"));
    const filePath = path.join(tmpDir, "missing.json");
    expect(readNewsBrief(filePath)).toBeNull();
  });

  it("parses minimal valid payload", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-brief-reader-"));
    const filePath = path.join(tmpDir, "brief.json");
    fs.writeFileSync(filePath, JSON.stringify({
      generatedAt: "2026-03-04T00:00:00.000Z",
      stats: { totalItems: 3, totalClusters: 2, dedupedCount: 1, feeds: 1 },
      topToday: [],
      topByTopic: [],
      risingTopics: [],
      summary: {
        observation: "ok",
        evidenceLinks: ["https://example.com/1"],
        watchVariables: ["금리"],
        counterSignals: ["둔화"],
      },
    }), "utf-8");

    const parsed = readNewsBrief(filePath);
    expect(parsed?.generatedAt).toBe("2026-03-04T00:00:00.000Z");
    expect(parsed?.summary.observation).toBe("ok");
  });
});
