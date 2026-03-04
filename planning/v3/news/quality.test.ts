import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { noRecommendationText } from "./digest";
import { runNewsRefresh } from "./cli/newsRefresh";
import { resolveItemsDir } from "./store";
import { type NewsSource } from "./contracts";

const FORBIDDEN_KEYS = new Set(["content", "html", "body", "fulltext"]);

function readFixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8");
}

function collectForbiddenKeys(value: unknown, found: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const row of value) collectForbiddenKeys(row, found);
    return;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const normalized = key.trim().toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized)) {
      found.add(normalized);
    }
    collectForbiddenKeys(record[key], found);
  }
}

describe("planning v3 news quality gates", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps storage payload free from full-text fields and stays idempotent", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-quality-"));
    roots.push(root);

    const sources: NewsSource[] = [
      {
        id: "fixture-rss",
        name: "Fixture RSS",
        feedUrl: "https://example.com/rss.xml",
        homepageUrl: "https://example.com",
        country: "KR",
        language: "ko",
        weight: 1.0,
        enabled: true,
      },
    ];

    const xml = readFixture("sample-rss.xml");
    const fetchMock: typeof fetch = vi.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;

    const first = await runNewsRefresh({
      rootDir: root,
      sources,
      fetchImpl: fetchMock,
      throttleMs: 0,
      now: new Date("2026-03-04T10:00:00.000Z"),
    });
    expect(first.itemsNew).toBeGreaterThan(0);

    const second = await runNewsRefresh({
      rootDir: root,
      sources,
      fetchImpl: fetchMock,
      throttleMs: 0,
      now: new Date("2026-03-04T10:05:00.000Z"),
    });
    expect(second.itemsNew).toBe(0);

    const itemFiles = fs.readdirSync(resolveItemsDir(root)).filter((name) => name.endsWith(".json"));
    expect(itemFiles.length).toBeGreaterThan(0);

    const forbidden = new Set<string>();
    for (const name of itemFiles) {
      const raw = fs.readFileSync(path.join(resolveItemsDir(root), name), "utf-8");
      collectForbiddenKeys(JSON.parse(raw), forbidden);
    }
    expect([...forbidden]).toEqual([]);
  });

  it("rejects banned recommendation language", () => {
    expect(noRecommendationText("매수 타이밍입니다.")).toBe(false);
    expect(noRecommendationText("무조건 오른다고 확신합니다.")).toBe(false);
    expect(noRecommendationText("조건부로 모니터링이 필요합니다.")).toBe(true);
  });
});
