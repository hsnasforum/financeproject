import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type NewsSource } from "../contracts";
import { runNewsRefresh } from "./newsRefresh";
import { resolveDailyDir, resolveDigestPath, resolveItemsDir, resolveStatePath } from "../store";

function readFixture(name: string): string {
  return fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf-8");
}

describe("planning v3 news cli", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("repeat run writes local store and creates 0 new items on second run", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-cli-"));
    roots.push(root);

    const sources: NewsSource[] = [
      {
        id: "fixture-rss",
        name: "Fixture RSS",
        feedUrl: "https://example.com/rss.xml",
        homepageUrl: "https://example.com",
        weight: 0.5,
        enabled: true,
      },
    ];

    const xml = readFixture("sample-rss.xml");

    const fetchMock: typeof fetch = vi.fn(async () => {
      return new Response(xml, {
        status: 200,
        headers: {
          etag: 'W/"sample-etag"',
          "last-modified": "Wed, 04 Mar 2026 10:00:00 GMT",
        },
      });
    }) as unknown as typeof fetch;

    const first = await runNewsRefresh({
      rootDir: root,
      sources,
      fetchImpl: fetchMock,
      throttleMs: 0,
      now: new Date("2026-03-04T10:00:00.000Z"),
    });

    expect(first.sourcesProcessed).toBe(1);
    expect(first.itemsFetched).toBe(2);
    expect(first.itemsNew).toBe(2);
    expect(first.itemsDeduped).toBe(0);
    expect(first.errors.length).toBe(0);

    const second = await runNewsRefresh({
      rootDir: root,
      sources,
      fetchImpl: fetchMock,
      throttleMs: 0,
      now: new Date("2026-03-04T10:10:00.000Z"),
    });

    expect(second.sourcesProcessed).toBe(1);
    expect(second.itemsFetched).toBe(2);
    expect(second.itemsNew).toBe(0);
    expect(second.itemsDeduped).toBe(2);
    expect(second.errors.length).toBe(0);

    const itemsDir = resolveItemsDir(root);
    const itemFiles = fs.readdirSync(itemsDir).filter((name) => name.endsWith(".json"));
    expect(itemFiles.length).toBe(2);

    const statePath = resolveStatePath(root);
    expect(fs.existsSync(statePath)).toBe(true);
    const dailyDir = resolveDailyDir(root);
    expect(fs.existsSync(dailyDir)).toBe(true);
    expect(fs.readdirSync(dailyDir).some((name) => name.endsWith(".json"))).toBe(true);
    expect(fs.existsSync(resolveDigestPath(root))).toBe(true);
  });
});
