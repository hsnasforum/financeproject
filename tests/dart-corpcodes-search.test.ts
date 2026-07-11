import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publicApis/dart/indexBuildGuard", async () => await import("../src/lib/publicApis/dart/indexBuildGuard"));
vi.mock("@/lib/publicApis/dart/corpIndex", async () => await import("../src/lib/publicApis/dart/corpIndex"));
vi.mock("@/lib/publicApis/dart/missingIndex", async () => await import("../src/lib/publicApis/dart/missingIndex"));

import { GET as searchGET } from "../src/app/api/public/disclosure/corpcodes/search/route";
import { GET as statusGET } from "../src/app/api/public/disclosure/corpcodes/status/route";
import { invalidateCorpIndexCache } from "../src/lib/publicApis/dart/corpIndex";

describe("disclosure corpcodes routes", () => {
  const originalPath = process.env.DART_CORPCODES_INDEX_PATH;
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "dart", "corpCodes.index.sample.json");

  beforeEach(() => {
    process.env.DART_CORPCODES_INDEX_PATH = fixturePath;
    invalidateCorpIndexCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (typeof originalPath === "string") process.env.DART_CORPCODES_INDEX_PATH = originalPath;
    else delete process.env.DART_CORPCODES_INDEX_PATH;
    invalidateCorpIndexCache();
    vi.restoreAllMocks();
  });

  it("serves search and status from fixture index", async () => {
    const searchReq = new Request("http://localhost/api/public/disclosure/corpcodes/search?q=%EC%82%BC%EC%84%B1&sort=name&limit=10");
    const searchRes = await searchGET(searchReq);
    const searchJson = await searchRes.json() as {
      items?: Array<{ corpCode?: string; corpName?: string }>;
      total?: number;
      generatedAt?: string;
    };

    expect(searchRes.status).toBe(200);
    expect((searchJson.items ?? []).length).toBeGreaterThan(0);
    expect((searchJson.items ?? []).some((item) => item.corpCode === "00126380")).toBe(true);
    expect(searchJson.total).toBeGreaterThanOrEqual(2);
    expect(searchJson.generatedAt).toBe("2026-02-25T00:00:00Z");

    const legacyReq = new Request("http://localhost/api/public/disclosure/corpcodes/search?query=%EC%82%BC%EC%84%B1&limit=5");
    const legacyRes = await searchGET(legacyReq);
    expect(legacyRes.status).toBe(200);

    const statusRes = await statusGET(
      new Request("http://localhost/api/public/disclosure/corpcodes/status"),
    );
    const statusJson = await statusRes.json() as {
      exists?: boolean;
      primaryPath?: string;
      meta?: { loadedPath?: string; count?: number };
    };

    expect(statusRes.status).toBe(200);
    expect(statusJson.exists).toBe(true);
    expect(statusJson.primaryPath).toBe(fixturePath);
    expect(statusJson.meta?.loadedPath).toBe(fixturePath);
    expect(statusJson.meta?.count).toBe(3);
  });

  it("returns 409 missing payload when index is unavailable", async () => {
    vi.spyOn(fs, "statSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const searchReq = new Request("http://localhost/api/public/disclosure/corpcodes/search?query=%EC%82%BC%EC%84%B1");
    const searchRes = await searchGET(searchReq);
    const searchJson = await searchRes.json() as {
      error?: string;
      message?: string;
      hintCommand?: string;
      hintCommandWithPath?: string;
      primaryPath?: string;
      triedPaths?: string[];
      buildEndpoint?: string;
      statusEndpoint?: string;
      canAutoBuild?: boolean;
    };

    expect(searchRes.status).toBe(409);
    expect(searchJson.error).toBe("CORPCODES_INDEX_MISSING");
    expect(searchJson.message).toBe("회사 검색 기준 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
    expect(searchJson.message).not.toMatch(/scripts\/|python|pnpm|\/api\/dev/i);
    expect(searchJson.hintCommand).toBe("");
    expect(searchJson.hintCommandWithPath).toBe("");
    expect(typeof searchJson.primaryPath).toBe("string");
    expect(Array.isArray(searchJson.triedPaths)).toBe(true);
    expect(searchJson.buildEndpoint).toBe("/api/public/disclosure/corpcodes/build");
    expect(searchJson.statusEndpoint).toBe("/api/public/disclosure/corpcodes/status");
    expect(typeof searchJson.canAutoBuild).toBe("boolean");

    const debugSearchRes = await searchGET(
      new Request("http://localhost/api/public/disclosure/corpcodes/search?query=%EC%82%BC%EC%84%B1&debug=1"),
    );
    const debugSearchJson = await debugSearchRes.json() as {
      message?: string;
      hintCommand?: string;
      hintCommandWithPath?: string;
    };
    expect(debugSearchRes.status).toBe(409);
    expect(debugSearchJson.message).toBe(searchJson.message);
    expect(debugSearchJson.hintCommand).toBe("python3 scripts/dart_corpcode_build.py");
    expect(debugSearchJson.hintCommandWithPath).toBe(
      "DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py",
    );

    const statusRes = await statusGET(
      new Request("http://localhost/api/public/disclosure/corpcodes/status"),
    );
    const statusJson = await statusRes.json() as {
      error?: string;
      message?: string;
      hintCommand?: string;
      hintCommandWithPath?: string;
    };
    expect(statusRes.status).toBe(409);
    expect(statusJson.error).toBe("CORPCODES_INDEX_MISSING");
    expect(statusJson.message).toBe(searchJson.message);
    expect(statusJson.hintCommand).toBe("");
    expect(statusJson.hintCommandWithPath).toBe("");

    const debugStatusRes = await statusGET(
      new Request("http://localhost/api/public/disclosure/corpcodes/status?debug=1"),
    );
    const debugStatusJson = await debugStatusRes.json() as {
      message?: string;
      hintCommand?: string;
      hintCommandWithPath?: string;
    };
    expect(debugStatusRes.status).toBe(409);
    expect(debugStatusJson.message).toBe(searchJson.message);
    expect(debugStatusJson.hintCommand).toBe("python3 scripts/dart_corpcode_build.py");
    expect(debugStatusJson.hintCommandWithPath).toBe(
      "DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py",
    );
  });
});
