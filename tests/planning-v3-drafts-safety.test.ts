import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as draftDetailGET } from "../src/app/api/planning/v3/drafts/[id]/route";
import { POST as draftsPOST } from "../src/app/api/planning/v3/drafts/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3200";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const MARKER = "PII_SHOULD_NOT_LEAK";

function requestJson(method: string, pathName: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathName}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/import`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestGet(pathName: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathName}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
    },
  });
}

describe("planning v3 drafts safety", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-safety-"));
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

  it("does not store or expose raw marker fields from request payload", async () => {
    const createResponse = await draftsPOST(requestJson("POST", "/api/planning/v3/drafts", {
      source: { kind: "csv", rows: 2, months: 1 },
      cashflow: [
        {
          ym: "2026-03",
          incomeKrw: 1_000_000,
          expenseKrw: -300_000,
          netKrw: 700_000,
          txCount: 2,
          description: MARKER,
        },
      ],
      draftPatch: {
        monthlyIncomeNet: 700_000,
        monthlyEssentialExpenses: 210_000,
        monthlyDiscretionaryExpenses: 90_000,
        assumptions: ["safe note"],
        monthsConsidered: 1,
      },
      rawCsv: `desc\n${MARKER}`,
      transactions: [{ desc: MARKER }],
    }));

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { ok?: boolean; id?: string };
    expect(created.ok).toBe(true);
    expect(created.id).toBeTruthy();

    const filePath = path.join(root, "v3", "drafts", `${created.id}.json`);
    const savedText = fs.readFileSync(filePath, "utf-8");
    expect(savedText).not.toContain(MARKER);

    const detailResponse = await draftDetailGET(
      requestGet(`/api/planning/v3/drafts/${created.id}`),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    expect(detailResponse.status).toBe(200);

    const detailText = await detailResponse.text();
    expect(detailText).not.toContain(MARKER);
  });
});
