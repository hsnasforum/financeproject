import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeNewsDatabase, openNewsDatabase } from "../src/lib/news/storageSqlite";

describe("news sqlite recovery", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("recreates db and keeps a backup when db file is malformed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-news-db-recover-"));
    roots.push(root);
    const dbPath = path.join(root, "news.sqlite");

    fs.writeFileSync(dbPath, "not-a-sqlite-file", "utf-8");

    const db = openNewsDatabase(dbPath);
    try {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='news_items'").get() as {
        name?: string;
      } | undefined;
      expect(row?.name).toBe("news_items");
    } finally {
      closeNewsDatabase(db);
    }

    const files = fs.readdirSync(root);
    expect(files.some((name) => name.startsWith("news.sqlite.corrupt."))).toBe(true);
  });
});
