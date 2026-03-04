import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_ITEMS, FIXTURE_NOW_ISO } from "./fixtures/sample-items";
import { selectTopFromStore } from "./selectTop";
import { upsertItems } from "./store";

describe("planning v3 news selectTop", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns deterministic topItems/topTopics order from stored items", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-v3-select-"));
    roots.push(root);

    upsertItems(FIXTURE_ITEMS, root);

    const result = selectTopFromStore({
      rootDir: root,
      now: new Date(FIXTURE_NOW_ISO),
      windowHours: 72,
      topN: 5,
      topM: 3,
    });

    expect(result.totalCandidates).toBe(4); // old item excluded by 72h window
    expect(result.topItems.map((row) => row.id)).toEqual([
      "i-fx-1",
      "i-rates-1",
      "i-policy-1",
    ]);
    expect(result.clusters.length).toBe(3);
    expect(result.topTopics.map((row) => row.topicId)).toEqual([
      "fx",
      "rates",
      "fiscal",
    ]);
  });
});
