import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listGET, POST as listPOST } from "../src/app/api/planning/v3/journal/entries/route";
import { GET as itemGET, PUT as itemPUT } from "../src/app/api/planning/v3/journal/entries/[id]/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

let root = "";

function requestGet(pathname: string, host = LOCAL_HOST, withOriginHeaders = false): Request {
  const origin = `http://${host}`;
  const headers = new Headers({ host });
  if (withOriginHeaders) {
    headers.set("origin", origin);
    headers.set("referer", `${origin}/planning/v3/journal`);
  }
  return new Request(`${origin}${pathname}`, {
    method: "GET",
    headers,
  });
}

function requestPost(pathname: string, body: unknown, cookie = "dev_csrf=csrf-token"): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/journal`,
    "content-type": "application/json",
  });
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function requestPut(pathname: string, body: unknown, cookie = "dev_csrf=csrf-token"): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/journal`,
    "content-type": "application/json",
  });
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
}

describe("planning v3 journal api", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-journal-api-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host GET", async () => {
    const response = await listGET(requestGet("/api/planning/v3/journal/entries", "example.com", true));
    const payload = await response.json() as { ok?: boolean; entries?: unknown[] };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.entries).toEqual([]);
  });

  it("blocks csrf mismatch for POST when dev csrf cookie exists", async () => {
    const response = await listPOST(requestPost("/api/planning/v3/journal/entries", {
      csrf: "csrf-body",
      entry: {
        date: "2026-03-04",
      },
    }, "dev_csrf=csrf-cookie"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("CSRF_MISMATCH");
  });

  it("stores and updates impact snapshot links", async () => {
    const create = await listPOST(requestPost("/api/planning/v3/journal/entries", {
      csrf: "csrf-token",
      entry: {
        date: "2026-03-04",
        observations: ["관찰"],
        assumptions: ["가정"],
        chosenOptions: ["균형"],
        followUpChecklist: ["체크"],
        linkedItems: ["https://example.com/item"],
        linkedIndicators: ["kr_cpi"],
        linkedScenarioIds: ["Base"],
        impactSnapshot: [
          {
            scenarioId: "Base",
            cashflowRisk: "Med",
            debtServiceRisk: "High",
            inflationPressureRisk: "Med",
            fxPressureRisk: "Low",
            incomeRisk: "Low",
            bufferAdequacy: "Low",
          },
        ],
        watchSeriesIds: ["kr_base_rate", "kr_cpi"],
      },
    }));

    const createPayload = await create.json() as { ok?: boolean; entry?: { id?: string; impactSnapshot?: unknown[] } };
    expect(create.status).toBe(200);
    expect(createPayload.ok).toBe(true);
    expect(createPayload.entry?.impactSnapshot?.length).toBe(1);

    const entryId = createPayload.entry?.id;
    expect(typeof entryId).toBe("string");

    const list = await listGET(requestGet("/api/planning/v3/journal/entries", LOCAL_HOST, true));
    const listPayload = await list.json() as {
      ok?: boolean;
      entries?: Array<{ linkedScenarioIds?: string[]; watchSeriesIds?: string[]; impactSnapshot?: unknown[] }>;
    };
    expect(list.status).toBe(200);
    expect(listPayload.ok).toBe(true);
    expect(listPayload.entries?.[0]?.linkedScenarioIds).toContain("Base");
    expect(listPayload.entries?.[0]?.watchSeriesIds).toContain("kr_base_rate");
    expect(listPayload.entries?.[0]?.impactSnapshot?.length).toBe(1);

    const getOne = await itemGET(requestGet(`/api/planning/v3/journal/entries/${entryId}`, LOCAL_HOST, true), {
      params: Promise.resolve({ id: String(entryId) }),
    });
    const getOnePayload = await getOne.json() as { ok?: boolean; entry?: { linkedScenarioIds?: string[] } };
    expect(getOne.status).toBe(200);
    expect(getOnePayload.ok).toBe(true);
    expect(getOnePayload.entry?.linkedScenarioIds).toContain("Base");

    const update = await itemPUT(requestPut(`/api/planning/v3/journal/entries/${entryId}`, {
      csrf: "csrf-token",
      entry: {
        date: "2026-03-05",
        observations: ["관찰2"],
        assumptions: ["가정2"],
        chosenOptions: ["방어"],
        followUpChecklist: ["체크2"],
        linkedItems: [],
        linkedIndicators: ["kr_usdkrw"],
        linkedScenarioIds: ["Bear"],
        impactSnapshot: [
          {
            scenarioId: "Bear",
            cashflowRisk: "High",
            debtServiceRisk: "High",
            inflationPressureRisk: "High",
            fxPressureRisk: "Med",
            incomeRisk: "Med",
            bufferAdequacy: "Low",
          },
        ],
        watchSeriesIds: ["kr_usdkrw"],
      },
    }), {
      params: Promise.resolve({ id: String(entryId) }),
    });
    const updatePayload = await update.json() as {
      ok?: boolean;
      entry?: {
        date?: string;
        linkedScenarioIds?: string[];
        impactSnapshot?: Array<{ scenarioId?: string }>;
      };
    };
    expect(update.status).toBe(200);
    expect(updatePayload.ok).toBe(true);
    expect(updatePayload.entry?.date).toBe("2026-03-05");
    expect(updatePayload.entry?.linkedScenarioIds).toContain("Bear");
    expect(updatePayload.entry?.impactSnapshot?.[0]?.scenarioId).toBe("Bear");
  });
});
