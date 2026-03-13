import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as transfersGET } from "../src/app/api/planning/v3/transactions/batches/[id]/transfers/route";
import { GET as transactionOverridesGET } from "../src/app/api/planning/v3/transactions/overrides/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;
const PROJECT_ROOT = process.cwd();
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const INTERNAL_ONLY_ROUTE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "/api/planning/v3/transactions/overrides",
    pattern: /\/api\/planning\/v3\/transactions\/overrides\b/,
  },
  {
    label: "/api/planning/v3/transactions/batches/merge",
    pattern: /\/api\/planning\/v3\/transactions\/batches\/merge\b/,
  },
  {
    label: "/api/planning/v3/transactions/batches/:id/transfers",
    pattern: /\/api\/planning\/v3\/transactions\/batches\/[^"'`\n]+\/transfers\b/,
  },
];

function requestGet(pathname: string, refererPath: string): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: REMOTE_ORIGIN,
      referer: `${REMOTE_ORIGIN}${refererPath}`,
    },
  });
}

function expectLocalOnly(payload: unknown) {
  expect(payload).toMatchObject({
    ok: false,
    error: { code: "LOCAL_ONLY" },
  });
}

function walkUserFacingSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (filePath.startsWith(path.join(PROJECT_ROOT, "src", "app", "api"))) continue;
      out.push(...walkUserFacingSource(filePath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) continue;
    out.push(filePath);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

describe("planning v3 internal-only transaction route contract", () => {
  let root = "";
  let batchId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-internal-route-contract-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;

    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,-50000,transfer out",
        "2026-03-01,50000,transfer in",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "unassigned",
      fileName: "tx.csv",
    });
    batchId = created.batch.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks same-origin remote host reads for internal-only transaction helper routes", async () => {
    const overridesResponse = await transactionOverridesGET(
      requestGet("/api/planning/v3/transactions/overrides?csrf=test", "/planning/v3/transactions"),
    );
    expect(overridesResponse.status).toBe(403);
    expectLocalOnly(await overridesResponse.json());

    const transfersResponse = await transfersGET(
      requestGet(
        `/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/transfers?csrf=test`,
        `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`,
      ),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(transfersResponse.status).toBe(403);
    expectLocalOnly(await transfersResponse.json());
  });

  it("user-facing source does not reference internal-only transaction helper routes", () => {
    const roots = [
      path.join(PROJECT_ROOT, "src", "app"),
      path.join(PROJECT_ROOT, "src", "components"),
      path.join(PROJECT_ROOT, "src", "lib"),
    ];
    const files = roots.flatMap((rootDir) => walkUserFacingSource(rootDir));
    const found: string[] = [];

    for (const filePath of files) {
      const source = fs.readFileSync(filePath, "utf8");
      for (const routeRef of INTERNAL_ONLY_ROUTE_PATTERNS) {
        if (!routeRef.pattern.test(source)) continue;
        found.push(`${path.relative(PROJECT_ROOT, filePath)} -> ${routeRef.label}`);
      }
    }

    expect(found).toEqual([]);
  });
});
