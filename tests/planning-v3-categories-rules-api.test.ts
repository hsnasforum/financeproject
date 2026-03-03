import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteRuleDELETE } from "../src/app/api/planning/v3/categories/rules/[id]/route";
import { GET as listRulesGET, POST as upsertRulePOST } from "../src/app/api/planning/v3/categories/rules/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4700";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/categories/rules`,
    },
  });
}

function requestJson(url: string, method: "POST" | "DELETE", body?: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${url}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/categories/rules`,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("planning v3 categories rules API", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-category-rules-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("supports rules CRUD lifecycle", async () => {
    const upsert = await upsertRulePOST(requestJson("/api/planning/v3/categories/rules", "POST", {
      csrf: "test",
      id: "rule-food-custom",
      categoryId: "food",
      match: { type: "contains", value: "cafe" },
      priority: 120,
      enabled: true,
    }));
    expect(upsert.status).toBe(200);

    const listed = await listRulesGET(requestGet("/api/planning/v3/categories/rules?csrf=test"));
    expect(listed.status).toBe(200);
    const listPayload = await listed.json() as {
      ok?: boolean;
      items?: Array<{ id?: string }>;
    };
    expect(listPayload.ok).toBe(true);
    expect((listPayload.items ?? []).some((row) => row.id === "rule-food-custom")).toBe(true);

    const deleted = await deleteRuleDELETE(
      requestJson("/api/planning/v3/categories/rules/rule-food-custom?csrf=test", "DELETE"),
      { params: Promise.resolve({ id: "rule-food-custom" }) },
    );
    expect(deleted.status).toBe(200);
    const deletePayload = await deleted.json() as { ok?: boolean; deleted?: boolean };
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.deleted).toBe(true);
  });

  it("returns 400 when contains keyword length is out of range", async () => {
    const response = await upsertRulePOST(requestJson("/api/planning/v3/categories/rules", "POST", {
      csrf: "test",
      id: "rule-invalid",
      categoryId: "food",
      match: { type: "contains", value: "x".repeat(51) },
      priority: 1,
      enabled: true,
    }));
    expect(response.status).toBe(400);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
      details?: Array<{ field?: string }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect((payload.details ?? []).some((row) => row.field === "match.value")).toBe(true);
  });
});
