import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeZip } from "../../../src/lib/ops/backup/zipCodec";
import {
  SUPPORT_BUNDLE_ENTRY_PATH,
  buildV3SupportBundlePlan,
  isWhitelistedSupportPath,
  runV3SupportBundle,
} from "./supportBundle";

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("planning v3 support bundle export", () => {
  const roots: string[] = [];

  function createRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-support-bundle-"));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("exports only sanitized aggregate payload and excludes forbidden paths", async () => {
    const root = createRoot();
    const out = path.join(root, ".data", "exports", "support.zip");

    writeJson(path.join(root, "package.json"), {
      name: "finance-test",
      version: "9.9.9",
    });

    writeJson(path.join(root, ".data/news/items/item-1.json"), {
      id: "item-1",
      sourceId: "bok_press_all",
      title: "금리 발표",
      url: "https://example.com/news/1",
      publishedAt: "2026-03-04T01:00:00.000Z",
      fetchedAt: "2026-03-04T01:10:00.000Z",
      content: "LEAK_FULL_TEXT_SHOULD_NOT_APPEAR",
      html: "<html>LEAK_HTML_SHOULD_NOT_APPEAR</html>",
    });
    writeJson(path.join(root, ".data/news/daily/2026-03-04.json"), [
      {
        dateKst: "2026-03-04",
        topicId: "rates",
        topicLabel: "금리",
        count: 2,
        scoreSum: 4.1,
        sourceDiversity: 1,
        burstGrade: "High",
      },
    ]);
    writeJson(path.join(root, ".data/news/state.json"), {
      lastRunAt: "2026-03-04T01:10:00.000Z",
      sources: {},
    });

    writeText(path.join(root, ".data/indicators/series/kr_base_rate.jsonl"), `${JSON.stringify({ date: "2026-03", value: 3.25 })}\n`);
    writeJson(path.join(root, ".data/indicators/meta/kr_base_rate.json"), {
      seriesId: "kr_base_rate",
      asOf: "2026-03-04T00:00:00.000Z",
      meta: {
        sourceId: "fixture",
        externalId: "fixture://kr_base_rate",
        frequency: "M",
      },
      observations: {
        count: 1,
        firstDate: "2026-03",
        lastDate: "2026-03",
      },
    });
    writeJson(path.join(root, ".data/indicators/state.json"), {
      lastRunAt: "2026-03-04T00:00:00.000Z",
      series: {
        kr_base_rate: {
          observationsCount: 1,
        },
      },
    });

    writeText(path.join(root, ".data/alerts/events.jsonl"), `${JSON.stringify({
      id: "evt-1",
      createdAt: "2026-03-04T02:00:00.000Z",
      dayKst: "2026-03-04",
      source: "news:refresh",
      ruleId: "topic_burst_high",
      ruleKind: "topic_burst",
      level: "high",
      title: "토픽 급증",
      summary: "조건 충족",
      targetType: "topic",
      targetId: "rates",
      snapshot: { triggerStatus: "met", burstLevel: "상" },
    })}\n`);

    writeJson(path.join(root, ".data/journal/entries/j-1.json"), {
      id: "j-1",
      date: "2026-03-04",
      observations: ["관찰"],
      assumptions: [],
      chosenOptions: [],
      followUpChecklist: [],
      linkedItems: [],
      linkedIndicators: [],
      linkedScenarioIds: [],
      impactSnapshot: [],
      watchSeriesIds: [],
      createdAt: "2026-03-04T02:00:00.000Z",
      updatedAt: "2026-03-04T02:10:00.000Z",
    });

    writeJson(path.join(root, ".data/exposure/profile.json"), {
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
    });

    // Explicitly forbidden files/paths that must never be included.
    writeText(path.join(root, ".env.local"), "SECRET=LEAK_ENV");
    writeText(path.join(root, ".data/news/.env.local"), "SECRET=LEAK_ENV_IN_DATA");
    writeText(path.join(root, ".data/untrusted/raw.csv"), "a,b,c\n1,2,3\n");
    writeText(path.join(root, ".data/alerts/api_key.txt"), "LEAK_API_KEY");

    const plan = buildV3SupportBundlePlan({
      cwd: root,
      out,
      now: new Date("2026-03-04T03:00:00.000Z"),
    });

    expect(plan.scanSummary.allowedFiles).toBeGreaterThan(0);
    expect(plan.scanSummary.skippedOutsideWhitelist).toBeGreaterThan(0);
    expect(plan.scanSummary.blockedSensitivePaths).toBeGreaterThan(0);
    expect(fs.existsSync(out)).toBe(false);

    const result = runV3SupportBundle({
      cwd: root,
      out,
      now: new Date("2026-03-04T03:00:00.000Z"),
    });
    expect(result.archivePath).toBe(out);
    expect(result.archiveBytes).toBeGreaterThan(0);
    expect(fs.existsSync(out)).toBe(true);

    const entries = await decodeZip(fs.readFileSync(out), {
      maxEntries: 100,
      maxTotalBytes: 1024 * 1024,
    });

    const names = [...entries.keys()].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual([SUPPORT_BUNDLE_ENTRY_PATH]);

    const bundleText = entries.get(SUPPORT_BUNDLE_ENTRY_PATH)?.toString("utf-8") ?? "";
    expect(bundleText).toContain("\"doctorSummary\"");
    expect(bundleText).toContain("\"enabledSourceIds\"");
    expect(bundleText).toContain("\"enabledSeriesIds\"");

    // No raw payloads, secret files, or forbidden source paths should leak.
    expect(bundleText).not.toContain("LEAK_FULL_TEXT_SHOULD_NOT_APPEAR");
    expect(bundleText).not.toContain("LEAK_HTML_SHOULD_NOT_APPEAR");
    expect(bundleText).not.toContain("LEAK_ENV");
    expect(bundleText).not.toContain("LEAK_API_KEY");
    expect(bundleText).not.toContain(".env.local");
    expect(bundleText).not.toContain(".data/untrusted");
    expect(bundleText).not.toContain("raw.csv");
    expect(bundleText).not.toContain("content");
    expect(bundleText).not.toContain("csvText");
  });

  it("whitelist helper accepts only allowed .data prefixes", () => {
    expect(isWhitelistedSupportPath(".data/news/items/a.json")).toBe(true);
    expect(isWhitelistedSupportPath(".data/indicators/series/a.jsonl")).toBe(true);
    expect(isWhitelistedSupportPath(".data/journal/entries/a.json")).toBe(true);
    expect(isWhitelistedSupportPath(".data/exposure/profile.json")).toBe(true);

    expect(isWhitelistedSupportPath(".data/untrusted/a.json")).toBe(false);
    expect(isWhitelistedSupportPath(".env.local")).toBe(false);
    expect(isWhitelistedSupportPath("tmp/file.json")).toBe(false);
  });
});
