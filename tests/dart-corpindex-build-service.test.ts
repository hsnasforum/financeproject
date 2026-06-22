import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCorpCodesIndex, sanitizeTail } from "../src/lib/publicApis/dart/corpIndexBuildService";
import type { CorpIndexStatus } from "../src/lib/publicApis/dart/corpIndex";

const fixturePath = path.join(process.cwd(), "tests", "fixtures", "dart", "corpCodes.index.sample.json");
const outPath = path.join(process.cwd(), "tmp", "dart", "test-corpCodes-build-service.index.json");

function cleanupOutPath(): void {
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
}

function statusForOutPath(): CorpIndexStatus {
  return {
    exists: true,
    primaryPath: outPath,
    triedPaths: [outPath],
    meta: {
      loadedPath: outPath,
      mtimeMs: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      count: 1,
    },
  };
}

describe("corpIndexBuildService", () => {
  afterEach(() => {
    cleanupOutPath();
  });

  it("builds the stub index without spawning python", async () => {
    cleanupOutPath();
    let now = 100;
    const result = await buildCorpCodesIndex({
      env: {
        DART_E2E_BUILD_STUB: "1",
        DART_CORPCODES_INDEX_PATH: outPath,
      },
      getStatus: statusForOutPath,
      now: () => {
        const current = now;
        now += 25;
        return current;
      },
      execFileAsync: async () => {
        throw new Error("python should not run for stub builds");
      },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      outPath,
      tookMs: 25,
      status: statusForOutPath(),
    });
    expect(fs.readFileSync(outPath, "utf-8")).toBe(fs.readFileSync(fixturePath, "utf-8"));
  });

  it("keeps the existing missing-python failure payload", async () => {
    const failure = new Error("spawn python3 ENOENT") as Error & { code?: string };
    failure.code = "ENOENT";

    const result = await buildCorpCodesIndex({
      env: {
        DART_CORPCODES_INDEX_PATH: outPath,
      },
      execFileAsync: async () => {
        throw failure;
      },
    });

    expect(result.status).toBe(500);
    expect(result.payload).toMatchObject({
      ok: false,
      message: "python3를 찾을 수 없습니다.",
      stdoutTail: "",
      stderrTail: "python3 executable not found",
    });
  });

  it("masks OpenDART secrets in process failure tails", async () => {
    const failure = new Error("script failed") as Error & { stdout?: string; stderr?: string };
    failure.stdout = "download started";
    failure.stderr = "GET /api/corpCode.xml?crtfc_key=secret-key&corp=1 OPENDART_API_KEY = another-secret";

    const result = await buildCorpCodesIndex({
      env: {
        DART_CORPCODES_INDEX_PATH: outPath,
      },
      execFileAsync: async () => {
        throw failure;
      },
    });

    expect(result.status).toBe(500);
    expect(result.payload).toMatchObject({
      ok: false,
      message: "corpCodes 인덱스 생성에 실패했습니다.",
      stdoutTail: "download started",
      stderrTail: "GET /api/corpCode.xml?crtfc_key=***&corp=1 OPENDART_API_KEY=***",
    });
  });

  it("trims long process tails from the end", () => {
    const longPrefix = "x".repeat(2_100);
    const tail = sanitizeTail(`${longPrefix}crtfc_key=secret`);

    expect(tail).toHaveLength(2_000);
    expect(tail.endsWith("crtfc_key=***")).toBe(true);
  });
});
