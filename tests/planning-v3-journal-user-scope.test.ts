import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as itemGET, PUT as itemPUT } from "../src/app/api/planning/v3/journal/entries/[id]/route";
import { GET as listGET, POST as listPOST } from "../src/app/api/planning/v3/journal/entries/route";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_AUTH_REQUIRED",
  "PLANNING_TRUST_AUTH_HEADERS",
  "PLANNING_USER_ID",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

const LOCAL_HOST = "localhost:4810";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

type ApiPayload = {
  ok?: boolean;
  entries?: Array<{ id?: string; date?: string }>;
  entry?: { id?: string; date?: string };
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
    referer: `${LOCAL_ORIGIN}/planning/v3/journal`,
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

function buildJsonRequest(method: "POST" | "PUT", urlPath: string, body: unknown, userId: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method,
    headers: userHeaders(userId, "application/json"),
    body: JSON.stringify(body),
  });
}

function journalEntryInput(date: string) {
  return {
    date,
    observations: [`observation-${date}`],
    assumptions: [],
    chosenOptions: [],
    followUpChecklist: [],
    linkedItems: [],
    linkedIndicators: [],
    linkedScenarioIds: [],
    impactSnapshot: [],
    watchSeriesIds: [],
  };
}

async function createJournalFixture(userId: string, date: string): Promise<string> {
  const response = await listPOST(buildJsonRequest("POST", "/api/planning/v3/journal/entries", {
    csrf: "test",
    entry: journalEntryInput(date),
  }, userId));
  expect(response.status).toBe(200);
  const payload = await response.json() as ApiPayload;
  const entryId = String(payload.entry?.id ?? "");
  expect(entryId).toBeTruthy();
  return entryId;
}

function contextFor(id: string): RouteContext {
  return { params: Promise.resolve({ id }) };
}

describe("planning v3 journal API user scope", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-journal-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not expose another user's journal entries through list, detail, or update", async () => {
    const aliceEntryId = await createJournalFixture("alice", "2026-04-01");
    const bobEntryId = await createJournalFixture("bob", "2026-04-02");

    const aliceList = await listGET(buildGetRequest("/api/planning/v3/journal/entries", "alice"));
    expect(aliceList.status).toBe(200);
    const aliceListPayload = await aliceList.json() as ApiPayload;
    expect(aliceListPayload.entries?.some((entry) => entry.id === aliceEntryId)).toBe(true);
    expect(aliceListPayload.entries?.some((entry) => entry.id === bobEntryId)).toBe(false);

    const bobList = await listGET(buildGetRequest("/api/planning/v3/journal/entries", "bob"));
    expect(bobList.status).toBe(200);
    const bobListPayload = await bobList.json() as ApiPayload;
    expect(bobListPayload.entries?.some((entry) => entry.id === bobEntryId)).toBe(true);
    expect(bobListPayload.entries?.some((entry) => entry.id === aliceEntryId)).toBe(false);

    const bobReadsAlice = await itemGET(
      buildGetRequest(`/api/planning/v3/journal/entries/${encodeURIComponent(aliceEntryId)}`, "bob"),
      contextFor(aliceEntryId),
    );
    expect(bobReadsAlice.status).toBe(404);
    const bobReadsAlicePayload = await bobReadsAlice.json() as ApiPayload;
    expect(bobReadsAlicePayload).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });

    const bobUpdatesAlice = await itemPUT(
      buildJsonRequest("PUT", `/api/planning/v3/journal/entries/${encodeURIComponent(aliceEntryId)}`, {
        csrf: "test",
        entry: journalEntryInput("2026-04-03"),
      }, "bob"),
      contextFor(aliceEntryId),
    );
    expect(bobUpdatesAlice.status).toBe(404);
    const bobUpdatesAlicePayload = await bobUpdatesAlice.json() as ApiPayload;
    expect(bobUpdatesAlicePayload).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
      meta: { userId: "bob", authSource: "trusted-header" },
    });
  });

  it("returns authenticated meta for invalid journal inputs", async () => {
    const invalidCreate = await listPOST(buildJsonRequest("POST", "/api/planning/v3/journal/entries", {
      csrf: "test",
      entry: {},
    }, "alice"));
    expect(invalidCreate.status).toBe(400);
    const invalidCreatePayload = await invalidCreate.json() as ApiPayload;
    expect(invalidCreatePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });

    const aliceEntryId = await createJournalFixture("alice", "2026-04-04");
    const invalidUpdate = await itemPUT(
      buildJsonRequest("PUT", `/api/planning/v3/journal/entries/${encodeURIComponent(aliceEntryId)}`, {
        csrf: "test",
        entry: {},
      }, "alice"),
      contextFor(aliceEntryId),
    );
    expect(invalidUpdate.status).toBe(400);
    const invalidUpdatePayload = await invalidUpdate.json() as ApiPayload;
    expect(invalidUpdatePayload).toMatchObject({
      ok: false,
      error: { code: "INPUT" },
      meta: { userId: "alice", authSource: "trusted-header" },
    });
  });
});
