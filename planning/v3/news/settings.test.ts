import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type NewsItem } from "./contracts";
import { runNewsRefresh } from "./cli/newsRefresh";
import { selectTopFromStore } from "./selectTop";
import { readNewsSettings, writeNewsSettings } from "./settings";
import { upsertItems } from "./store";

describe("planning v3 news settings overrides", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads and writes local settings file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-settings-"));
    roots.push(root);

    const saved = writeNewsSettings({
      sources: [{ id: "bok_press_all", enabled: false, weight: 0.8 }],
      topics: [{ id: "rates", keywords: ["기준금리", "테스트키워드"] }],
    }, root);

    expect(saved.updatedAt).toBeTruthy();
    const loaded = readNewsSettings(root);
    expect(loaded.sources[0]?.id).toBe("bok_press_all");
    expect(loaded.topics[0]?.keywords).toContain("테스트키워드");
  });

  it("select uses merged source/topic overrides from local settings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-settings-"));
    roots.push(root);

    writeNewsSettings({
      sources: [
        { id: "bok_press_all", weight: 0.1 },
        { id: "kosis_monthly_trend", weight: 1.8 },
      ],
      topics: [
        { id: "rates", keywords: ["customrate"] },
      ],
    }, root);

    const nowIso = "2026-03-04T12:00:00.000Z";
    const items: NewsItem[] = [
      {
        id: "a",
        sourceId: "bok_press_all",
        title: "customrate outlook",
        url: "https://example.com/a",
        publishedAt: "2026-03-04T09:00:00.000Z",
        snippet: "customrate headline",
        fetchedAt: nowIso,
      },
      {
        id: "b",
        sourceId: "kosis_monthly_trend",
        title: "customrate outlook",
        url: "https://example.com/b",
        publishedAt: "2026-03-04T09:00:00.000Z",
        snippet: "customrate headline",
        fetchedAt: nowIso,
      },
    ];
    upsertItems(items, root);

    const selected = selectTopFromStore({
      rootDir: root,
      now: new Date(nowIso),
      windowHours: 72,
      topN: 2,
      topM: 2,
    });

    expect(selected.topItems[0]?.id).toBe("b");
    expect(selected.topTopics[0]?.topicId).toBe("rates");
  });

  it("ingest uses source enabled override when explicit sources option is omitted", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-settings-"));
    roots.push(root);

    writeNewsSettings({
      sources: [
        { id: "bok_press_all", enabled: false },
        { id: "bok_mpc_decisions", enabled: false },
        { id: "kosis_monthly_trend", enabled: false },
        { id: "kostat_press", enabled: false },
        { id: "moef_econ_policy_en", enabled: false },
      ],
      topics: [],
    }, root);

    const result = await runNewsRefresh({
      rootDir: root,
      throttleMs: 0,
      fetchImpl: async () => new Response("", { status: 200 }),
      now: new Date("2026-03-04T12:00:00.000Z"),
    });

    expect(result.sourcesProcessed).toBe(0);
    expect(result.itemsFetched).toBe(0);
    expect(result.itemsNew).toBe(0);
  });
});
