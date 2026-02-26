import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/api/dev/artifacts/route";

const REFRESH_LOG_PATH = path.join(process.cwd(), "tmp", "daily_refresh.log");
const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

function backupAndRemove(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const backup = fs.readFileSync(filePath, "utf-8");
  fs.unlinkSync(filePath);
  return backup;
}

function restoreFile(filePath: string, backup: string | null): void {
  if (backup === null) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, backup, "utf-8");
}

describe("dev artifacts route", () => {
  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("returns 400 when name query is missing", async () => {
    env.NODE_ENV = "test";
    const response = await GET(new Request("http://localhost/api/dev/artifacts"));
    const json = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INPUT");
  });

  it("returns 400 when name is not allowed", async () => {
    env.NODE_ENV = "test";
    const response = await GET(new Request("http://localhost/api/dev/artifacts?name=../../etc/passwd"));
    const json = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INPUT");
  });

  it("returns ok:true data:null when allowed file is missing", async () => {
    env.NODE_ENV = "test";
    const backup = backupAndRemove(REFRESH_LOG_PATH);

    try {
      const response = await GET(new Request("http://localhost/api/dev/artifacts?name=refresh_log"));
      const json = (await response.json()) as { ok?: boolean; data?: unknown };

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data).toBeNull();
    } finally {
      restoreFile(REFRESH_LOG_PATH, backup);
    }
  });

  it("returns 404 in production mode", async () => {
    env.NODE_ENV = "production";
    const response = await GET(new Request("http://localhost/api/dev/artifacts?name=refresh_log"));
    const json = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("NOT_FOUND");
  });
});
