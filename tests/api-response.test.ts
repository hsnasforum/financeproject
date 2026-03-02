import { describe, expect, it } from "vitest";
import { jsonError, jsonOk, statusFromCode } from "../src/lib/http/apiResponse";

describe("api response helper", () => {
  it("maps core status codes", () => {
    expect(statusFromCode("INPUT")).toBe(400);
    expect(statusFromCode("INVALID_DATE_FORMAT")).toBe(400);
    expect(statusFromCode("NO_DATA")).toBe(404);
    expect(statusFromCode("ENV_MISSING")).toBe(400);
    expect(statusFromCode("UPSTREAM")).toBe(502);
    expect(statusFromCode("HTTP")).toBe(502);
    expect(statusFromCode("INTERNAL")).toBe(502);
    expect(statusFromCode("UNKNOWN")).toBe(502);
  });

  it("returns standardized jsonError shape with issues", async () => {
    const res = jsonError("INPUT", "invalid", {
      issues: ["kind must be one of deposit|saving"],
    });
    const json = await res.json() as { ok?: boolean; error?: { code?: string; issues?: string[] } };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INPUT");
    expect(json.error?.issues).toEqual(["kind must be one of deposit|saving"]);
  });

  it("adds fixHref for mapped failure codes", async () => {
    const res = jsonError("BACKUP_INVALID", "invalid backup");
    const json = await res.json() as { error?: { code?: string; fixHref?: string } };
    expect(json.error?.code).toBe("BACKUP_INVALID");
    expect(json.error?.fixHref).toBe("/ops/backup");
  });

  it("keeps object payload top-level for jsonOk", async () => {
    const res = jsonOk({ result: { score: 1 } });
    const json = await res.json() as { ok?: boolean; result?: { score?: number } };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.result?.score).toBe(1);
  });

  it("returns INTERNAL when error payload violates response schema", async () => {
    const res = jsonError("INPUT", "   ");
    const json = await res.json() as {
      ok?: boolean;
      error?: {
        code?: string;
        message?: string;
      };
    };

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("INTERNAL");
    expect(json.error?.message).toContain("API response contract violation");
  });
});
