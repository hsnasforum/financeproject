import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type NewsItem, type RuntimeState } from "../contracts";
import { hasItem, readState, resolveItemsDir, resolveStatePath, upsertItems, writeState } from "./index";

function makeItem(id: string): NewsItem {
  return {
    id,
    sourceId: "test-source",
    title: `title-${id}`,
    url: `https://example.com/${id}`,
    fetchedAt: "2026-03-04T10:00:00.000Z",
  };
}

describe("planning v3 news store", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes items and state in .data/news-compatible layout", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-store-"));
    roots.push(root);

    expect(hasItem("a1", root)).toBe(false);

    const first = upsertItems([makeItem("a1"), makeItem("a2"), makeItem("a1")], root);
    expect(first.itemsNew).toBe(2);
    expect(first.itemsDeduped).toBe(1);

    expect(hasItem("a1", root)).toBe(true);
    expect(hasItem("a2", root)).toBe(true);

    const second = upsertItems([makeItem("a1")], root);
    expect(second.itemsNew).toBe(0);
    expect(second.itemsDeduped).toBe(1);

    const itemsDir = resolveItemsDir(root);
    const files = fs.readdirSync(itemsDir).filter((name) => name.endsWith(".json"));
    expect(files.length).toBe(2);

    const state: RuntimeState = {
      lastRunAt: "2026-03-04T10:00:00.000Z",
      sources: {
        "test-source": {
          etag: 'W/"etag"',
          lastModified: "Wed, 04 Mar 2026 10:00:00 GMT",
          lastRunAt: "2026-03-04T10:00:00.000Z",
        },
      },
    };

    writeState(state, root);
    expect(fs.existsSync(resolveStatePath(root))).toBe(true);

    const reloaded = readState(root);
    expect(reloaded.lastRunAt).toBe("2026-03-04T10:00:00.000Z");
    expect(reloaded.sources["test-source"]?.etag).toBe('W/"etag"');
  });
});
