import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteRuleDELETE } from "../src/app/api/planning/v3/categories/rules/[id]/route";
import { GET as listRulesGET, POST as upsertRulePOST } from "../src/app/api/planning/v3/categories/rules/route";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "PLANNING_V3_CATEGORY_RULES_PATH",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:4720";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  deleted?: boolean;
  rule?: { id?: string };
  items?: Array<{ id?: string }>;
  error?: { code?: string };
  meta?: { userId?: string; authSource?: string };
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function userHeaders(userId: string, contentType?: string): Record<string, string> {
  return {
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/categories/rules`,
    ...(contentType ? { "content-type": contentType } : {}),
    "x-planning-user-id": userId,
  };
}

function buildGetRequest(urlPath: string, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: userHeaders(userId),
  });
}

function buildJsonRequest(method: "POST" | "DELETE", urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

async function upsertRuleFixture(userId: string, ruleId: string): Promise<string> {
  const response = await upsertRulePOST(buildJsonRequest("POST", "/api/planning/v3/categories/rules", {
    csrf: "test",
    id: ruleId,
    categoryId: "food",
    match: { type: "contains", value: `${userId}-cafe` },
    priority: 120,
    enabled: true,
  }, userId));
  expect(response.status).toBe(200);
  const payload = await response.json() as ApiPayload;
  expect(payload.rule?.id).toBe(ruleId);
  return ruleId;
}

describe("planning v3 category rules API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-category-rules-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.PLANNING_V3_CATEGORY_RULES_PATH;
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not expose another user's category rules through list or delete", async () => {
    const aliceRuleId = await upsertRuleFixture("alice", "rule-alice-food");
    const bobRuleId = await upsertRuleFixture("bob", "rule-bob-food");

    const aliceList = await listRulesGET(buildGetRequest("/api/planning/v3/categories/rules?csrf=test", "alice"));
    expect(aliceList.status).toBe(200);
    const aliceListPayload = await aliceList.json() as ApiPayload;
    expect(aliceListPayload.items?.some((row) => row.id === aliceRuleId)).toBe(true);
    expect(aliceListPayload.items?.some((row) => row.id === bobRuleId)).toBe(false);

    const bobList = await listRulesGET(buildGetRequest("/api/planning/v3/categories/rules?csrf=test", "bob"));
    expect(bobList.status).toBe(200);
    const bobListPayload = await bobList.json() as ApiPayload;
    expect(bobListPayload.items?.some((row) => row.id === bobRuleId)).toBe(true);
    expect(bobListPayload.items?.some((row) => row.id === aliceRuleId)).toBe(false);

    const bobDeleteAlice = await deleteRuleDELETE(
      buildJsonRequest("DELETE", `/api/planning/v3/categories/rules/${aliceRuleId}?csrf=test`, { csrf: "test" }, "bob"),
      { params: Promise.resolve({ id: aliceRuleId }) },
    );
    expect(bobDeleteAlice.status).toBe(200);
    const bobDeleteAlicePayload = await bobDeleteAlice.json() as ApiPayload;
    expect(bobDeleteAlicePayload).toMatchObject({ ok: true, deleted: false });

    const aliceAfterBobDelete = await listRulesGET(buildGetRequest("/api/planning/v3/categories/rules?csrf=test", "alice"));
    expect(aliceAfterBobDelete.status).toBe(200);
    const aliceAfterBobDeletePayload = await aliceAfterBobDelete.json() as ApiPayload;
    expect(aliceAfterBobDeletePayload.items?.some((row) => row.id === aliceRuleId)).toBe(true);

    const aliceDelete = await deleteRuleDELETE(
      buildJsonRequest("DELETE", `/api/planning/v3/categories/rules/${aliceRuleId}?csrf=test`, { csrf: "test" }, "alice"),
      { params: Promise.resolve({ id: aliceRuleId }) },
    );
    expect(aliceDelete.status).toBe(200);
    const aliceDeletePayload = await aliceDelete.json() as ApiPayload;
    expect(aliceDeletePayload).toMatchObject({ ok: true, deleted: true });
  });

  it("returns authenticated meta for category rule input errors", async () => {
    const invalidUpsert = await upsertRulePOST(buildJsonRequest("POST", "/api/planning/v3/categories/rules", {
      csrf: "test",
      id: "rule-invalid-food",
      categoryId: "food",
      match: { type: "contains", value: "x".repeat(51) },
      priority: 1,
      enabled: true,
    }, "bob"));
    expect(invalidUpsert.status).toBe(400);
    const invalidUpsertPayload = await invalidUpsert.json() as ApiPayload;
    expect(invalidUpsertPayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const invalidDelete = await deleteRuleDELETE(
      buildJsonRequest("DELETE", "/api/planning/v3/categories/rules/%2Fbad?csrf=test", { csrf: "test" }, "bob"),
      { params: Promise.resolve({ id: "/bad" }) } satisfies RouteContext,
    );
    expect(invalidDelete.status).toBe(400);
    const invalidDeletePayload = await invalidDelete.json() as ApiPayload;
    expect(invalidDeletePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });
});
