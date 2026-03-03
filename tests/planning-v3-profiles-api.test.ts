import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as profilesGET } from "../src/app/api/planning/v3/profiles/route";
import { createProfile } from "../src/lib/planning/store/profileStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:5031";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestGet(pathname: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/profile/drafts`,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("GET /api/planning/v3/profiles", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-profiles-api-"));
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

  it("returns sorted read-only profile rows", async () => {
    const first = await createProfile({
      name: "alpha",
      profile: {
        monthlyIncomeNet: 1_000_000,
        monthlyEssentialExpenses: 500_000,
        monthlyDiscretionaryExpenses: 200_000,
        liquidAssets: 0,
        investmentAssets: 0,
        debts: [],
        goals: [],
      },
    });
    await sleep(5);
    const second = await createProfile({
      name: "beta",
      profile: {
        monthlyIncomeNet: 2_000_000,
        monthlyEssentialExpenses: 900_000,
        monthlyDiscretionaryExpenses: 250_000,
        liquidAssets: 0,
        investmentAssets: 0,
        debts: [],
        goals: [],
      },
    });

    const response = await profilesGET(requestGet("/api/planning/v3/profiles?csrf=test"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      data?: Array<{ profileId?: string; name?: string; updatedAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect((payload.data ?? []).length).toBeGreaterThanOrEqual(2);
    expect(payload.data?.[0]?.profileId).toBe(second.id);
    expect(payload.data?.[1]?.profileId).toBe(first.id);
  });

  it("does not expose forbidden raw keys", async () => {
    await createProfile({
      name: "profile-row",
      profile: {
        monthlyIncomeNet: 1,
        monthlyEssentialExpenses: 1,
        monthlyDiscretionaryExpenses: 1,
        liquidAssets: 0,
        investmentAssets: 0,
        debts: [],
        goals: [],
      },
    });

    const response = await profilesGET(requestGet("/api/planning/v3/profiles?csrf=test"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const keys = collectKeys(payload).join("\n").toLowerCase();
    expect(keys.includes("desc")).toBe(false);
    expect(keys.includes("description")).toBe(false);
    expect(keys.includes("merchant")).toBe(false);
    expect(keys.includes("rawline")).toBe(false);
    expect(keys.includes("originalcsv")).toBe(false);
  });
});
