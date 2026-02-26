import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/public/disclosure/corpcodes/build/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalBuildStub = process.env.DART_E2E_BUILD_STUB;
const originalOutPath = process.env.DART_CORPCODES_INDEX_PATH;
const originalBuildToken = process.env.DART_INDEX_BUILD_TOKEN;
const fixturePath = path.join(process.cwd(), "tests", "fixtures", "dart", "corpCodes.index.sample.json");
const outPath = path.join(process.cwd(), "tmp", "dart", "test-corpCodes-build-auth.index.json");

function cleanupOutPath(): void {
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
}

describe("dart corpcodes build route auth", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.DART_E2E_BUILD_STUB = "1";
    env.DART_CORPCODES_INDEX_PATH = outPath;
    delete env.DART_INDEX_BUILD_TOKEN;
    cleanupOutPath();
  });

  afterEach(() => {
    cleanupOutPath();
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalBuildStub === "string") env.DART_E2E_BUILD_STUB = originalBuildStub;
    else delete env.DART_E2E_BUILD_STUB;
    if (typeof originalOutPath === "string") env.DART_CORPCODES_INDEX_PATH = originalOutPath;
    else delete env.DART_CORPCODES_INDEX_PATH;
    if (typeof originalBuildToken === "string") env.DART_INDEX_BUILD_TOKEN = originalBuildToken;
    else delete env.DART_INDEX_BUILD_TOKEN;
  });

  it("returns 403 when host is not localhost in dev/test", async () => {
    const response = await POST(new Request("http://evil.com/api/public/disclosure/corpcodes/build", {
      method: "POST",
      headers: {
        host: "evil.com",
        origin: "http://evil.com",
      },
    }));
    const json = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("LOCAL_ONLY");
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it("returns 403 when origin does not match host in dev/test", async () => {
    const response = await POST(new Request("http://localhost:3000/api/public/disclosure/corpcodes/build", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://evil.com",
      },
    }));
    const json = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("ORIGIN_MISMATCH");
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it("returns 403 in production when build token is missing", async () => {
    env.NODE_ENV = "production";
    delete env.DART_INDEX_BUILD_TOKEN;

    const response = await POST(new Request("http://localhost/api/public/disclosure/corpcodes/build", {
      method: "POST",
      headers: {
        host: "localhost",
      },
    }));
    const json = (await response.json()) as { ok?: boolean; message?: string };

    expect(response.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("권한");
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it("builds from stub fixture when localhost + same origin", async () => {
    const response = await POST(new Request("http://localhost:3000/api/public/disclosure/corpcodes/build", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/public/dart",
      },
    }));
    const json = (await response.json()) as { ok?: boolean; outPath?: string };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.outPath).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, "utf-8")).toBe(fs.readFileSync(fixturePath, "utf-8"));
  });
});
