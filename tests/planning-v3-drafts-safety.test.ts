import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as draftsPost } from "../src/app/api/planning/v3/drafts/route";
import { GET as draftGet } from "../src/app/api/planning/v3/drafts/[id]/route";

const SECRET = "SECRET_PII_SHOULD_NOT_LEAK";
const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const env = process.env as Record<string, string | undefined>;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function buildJsonRequest(pathname: string, method: string, body: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
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

describe("planning v3 drafts safety", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-drafts-safety-"));
    env.PLANNING_DATA_DIR = path.join(root, "planning-data");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("draft-safety-id");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never leaks forbidden raw string into saved json, API response, or error message", async () => {
    const saveResponse = await draftsPost(buildJsonRequest("/api/planning/v3/drafts", "POST", {
      cashflow: [
        {
          ym: "2026-03",
          incomeKrw: 1_500_000,
          expenseKrw: -500_000,
          netKrw: 1_000_000,
          txCount: 2,
          description: SECRET,
        },
      ],
      draftPatch: {
        monthlyIncomeNet: 1_000_000,
        monthlyEssentialExpenses: 350_000,
        monthlyDiscretionaryExpenses: 150_000,
        assumptions: ["monthlyIncomeNet uses median monthly net (assumption)"],
        monthsConsidered: 1,
        rawDescription: SECRET,
      },
      meta: {
        rows: 1,
        months: 1,
        originalCsvSnippet: SECRET,
      },
    }));

    expect(saveResponse.status).toBe(200);
    const saveText = await saveResponse.text();
    expect(saveText).not.toContain(SECRET);

    const saveJson = JSON.parse(saveText) as { draft?: { id?: string } };
    expect(saveJson.draft?.id).toBe("draft-safety-id");

    const draftFilePath = path.join(env.PLANNING_DATA_DIR as string, "v3", "drafts", "draft-safety-id.json");
    const savedContent = fs.readFileSync(draftFilePath, "utf-8");
    expect(savedContent).not.toContain(SECRET);

    const invalidId = `bad id ${SECRET}`;
    const errorResponse = await draftGet(
      new Request(`${LOCAL_ORIGIN}/api/planning/v3/drafts/bad-id`, {
        method: "GET",
        headers: {
          host: LOCAL_HOST,
          origin: LOCAL_ORIGIN,
          referer: `${LOCAL_ORIGIN}/planning/v3/drafts`,
        },
      }),
      { params: Promise.resolve({ id: invalidId }) },
    );
    const errorText = await errorResponse.text();
    expect(errorText).not.toContain(SECRET);
  });
});

