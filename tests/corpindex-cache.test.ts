import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { invalidateCorpIndexCache, loadCorpIndex } from "../src/lib/publicApis/dart/corpIndex";

function writeIndex(filePath: string, corpName: string) {
  const payload = {
    version: 1,
    generatedAt: "2026-02-18T00:00:00Z",
    count: 1,
    items: [{ corpCode: "00000001", corpName, normName: corpName }],
  };
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf-8");
}

describe("corpIndex cache invalidation", () => {
  const prevEnv = process.env.DART_CORPCODES_INDEX_PATH;

  afterEach(() => {
    if (typeof prevEnv === "string") process.env.DART_CORPCODES_INDEX_PATH = prevEnv;
    else delete process.env.DART_CORPCODES_INDEX_PATH;
    invalidateCorpIndexCache();
  });

  it("reloads new file content immediately after invalidate", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "corpindex-"));
    const filePath = path.join(dir, "corpCodes.index.json");
    process.env.DART_CORPCODES_INDEX_PATH = filePath;

    try {
      writeIndex(filePath, "초기회사");
      invalidateCorpIndexCache();
      const first = loadCorpIndex();
      expect(first?.items[0]?.corpName).toBe("초기회사");

      writeIndex(filePath, "갱신회사");
      invalidateCorpIndexCache();
      const refreshed = loadCorpIndex();
      expect(refreshed?.items[0]?.corpName).toBe("갱신회사");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
