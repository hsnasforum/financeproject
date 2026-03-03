import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as profileDraftGET } from "../src/app/api/planning/v3/profile/draft/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4950";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestGet(search = ""): Request {
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/profile/draft${search}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/profile/draft`,
    },
  });
}

function collectKeys(value: unknown, parent = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectKeys(entry, `${parent}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  const rows: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const pathKey = parent ? `${parent}.${key}` : key;
    rows.push(pathKey);
    rows.push(...collectKeys(child, pathKey));
  }
  return rows;
}

describe("GET /api/planning/v3/profile/draft", () => {
  let root = "";
  let accountId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-profile-draft-v2-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    const account = await createAccount({ name: "Main", kind: "checking" });
    accountId = account.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns 400 when batchId is missing", async () => {
    const response = await profileDraftGET(requestGet("?csrf=test"));
    expect(response.status).toBe(400);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("returns 404 when batch does not exist", async () => {
    const response = await profileDraftGET(requestGet("?batchId=b_missing&csrf=test"));
    expect(response.status).toBe(404);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("NO_DATA");
  });

  it("returns whitelisted summary payload without raw fields", async () => {
    const marker = "PII_SHOULD_NOT_LEAK";
    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        `2026-01-01,3000000,${marker}`,
        `2026-01-02,-1200000,${marker}`,
        `2026-02-01,3200000,${marker}`,
        `2026-02-02,-1100000,${marker}`,
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      fileName: "draft-v2.csv",
    });

    const response = await profileDraftGET(
      requestGet(`?batchId=${encodeURIComponent(created.batch.id)}&csrf=test`),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.includes(marker)).toBe(false);

    const payload = JSON.parse(text) as {
      ok?: boolean;
      data?: unknown;
    };
    expect(payload.ok).toBe(true);

    const keys = collectKeys(payload);
    const joined = keys.join("\n");
    expect(joined.includes("description")).toBe(false);
    expect(joined.includes("rawLine")).toBe(false);
    expect(joined.includes("csvText")).toBe(false);
  });
});

