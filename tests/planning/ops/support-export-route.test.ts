import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as supportExportGET } from "../../../src/app/api/ops/support/export.zip/route";
import { decodeZip } from "../../../src/lib/ops/backup/zipCodec";
import { appendOpsAuditEvent } from "../../../src/lib/ops/securityAuditLog";
import { appendOpsMetricEvent } from "../../../src/lib/ops/metricsLog";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalAuditPath = process.env.PLANNING_OPS_AUDIT_PATH;
const originalMetricsPath = process.env.PLANNING_OPS_METRICS_PATH;
const originalMigrationStatePath = process.env.PLANNING_MIGRATION_STATE_PATH;
const originalDartCorpCodesIndexPath = process.env.DART_CORPCODES_INDEX_PATH;
const originalPlanningAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;

function localHeaders(host = LOCAL_HOST, csrf = "csrf-token"): HeadersInit {
  const origin = `http://${host}`;
  return {
    host,
    origin,
    referer: `${origin}/ops/support`,
    cookie: `dev_action=1; dev_csrf=${encodeURIComponent(csrf)}`,
  };
}

describe.sequential("ops support export route", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ops-support-export-"));
    env.NODE_ENV = "test";
    env.PLANNING_OPS_AUDIT_PATH = path.join(root, "ops", "audit", "events.ndjson");
    env.PLANNING_OPS_METRICS_PATH = path.join(root, "ops", "metrics", "events.ndjson");
    env.PLANNING_MIGRATION_STATE_PATH = path.join(root, "planning", "migrations", "migrationState.json");
    env.DART_CORPCODES_INDEX_PATH = path.join(root, "dart", "corpCodes.index.json");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, "planning", "assumptions.latest.json");

    await appendOpsAuditEvent({
      eventType: "SUPPORT_TEST_EVENT",
      meta: {
        token: "Bearer super-secret-token",
        note: "ECOS_API_KEY=SHOULD_NOT_LEAK",
      },
    });

    await appendOpsMetricEvent({
      type: "RUN_STAGE",
      meta: {
        status: "FAILED",
        durationMs: 25,
        code: "INTERNAL",
        message: "GITHUB_TOKEN=SHOULD_NOT_LEAK",
      },
    });

    await fs.promises.mkdir(path.dirname(env.PLANNING_MIGRATION_STATE_PATH), { recursive: true });
    await fs.promises.writeFile(
      env.PLANNING_MIGRATION_STATE_PATH,
      `${JSON.stringify({
        version: 1,
        updatedAt: "2026-03-02T00:00:00.000Z",
        migrations: {
          "storage-schema-v2": {
            status: "pending",
            attempts: 1,
            lastAttemptAt: "2026-03-02T00:00:00.000Z",
            lastError: {
              code: "MIGRATION_FAILED",
              message: "monthlyIncomeNet leak should be hidden",
            },
          },
        },
      }, null, 2)}\n`,
      "utf-8",
    );

    await fs.promises.mkdir(path.dirname(env.DART_CORPCODES_INDEX_PATH), { recursive: true });
    await fs.promises.writeFile(
      env.DART_CORPCODES_INDEX_PATH,
      `${JSON.stringify({
        version: 1,
        generatedAt: "2026-03-12T00:00:00.000Z",
        count: 2,
        items: [
          { corpCode: "001", corpName: "테스트전자", normName: "테스트전자" },
          { corpCode: "002", corpName: "테스트은행", normName: "테스트은행" },
        ],
      }, null, 2)}\n`,
      "utf-8",
    );

    await fs.promises.mkdir(path.dirname(env.PLANNING_ASSUMPTIONS_PATH), { recursive: true });
    await fs.promises.writeFile(
      env.PLANNING_ASSUMPTIONS_PATH,
      `${JSON.stringify({
        version: 1,
        asOf: "2026-03-11",
        fetchedAt: "2026-03-12T01:00:00.000Z",
        korea: {},
        sources: [{ name: "ECOS", url: "https://example.com", fetchedAt: "2026-03-12T01:00:00.000Z" }],
        warnings: [],
      }, null, 2)}\n`,
      "utf-8",
    );
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalAuditPath === "string") env.PLANNING_OPS_AUDIT_PATH = originalAuditPath;
    else delete env.PLANNING_OPS_AUDIT_PATH;

    if (typeof originalMetricsPath === "string") env.PLANNING_OPS_METRICS_PATH = originalMetricsPath;
    else delete env.PLANNING_OPS_METRICS_PATH;

    if (typeof originalMigrationStatePath === "string") env.PLANNING_MIGRATION_STATE_PATH = originalMigrationStatePath;
    else delete env.PLANNING_MIGRATION_STATE_PATH;

    if (typeof originalDartCorpCodesIndexPath === "string") env.DART_CORPCODES_INDEX_PATH = originalDartCorpCodesIndexPath;
    else delete env.DART_CORPCODES_INDEX_PATH;

    if (typeof originalPlanningAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalPlanningAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("exports redacted diagnostics zip", async () => {
    const response = await supportExportGET(new Request(`${LOCAL_ORIGIN}/api/ops/support/export.zip?csrf=csrf-token`, {
      method: "GET",
      headers: localHeaders(),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/zip");

    const zipBytes = Buffer.from(await response.arrayBuffer());
    const entries = await decodeZip(zipBytes, {
      maxEntries: 200,
      maxTotalBytes: 8 * 1024 * 1024,
    });

    expect(entries.has("manifest.json")).toBe(true);
    expect(entries.has("doctor.json")).toBe(true);
    expect(entries.has("app.json")).toBe(true);
    expect(entries.has("migration_state.json")).toBe(true);
    expect(entries.has("policy.json")).toBe(true);
    expect(entries.has("audit_summary.json")).toBe(true);
    expect(entries.has("metrics_summary.json")).toBe(true);
    expect(entries.has("metrics_recent.json")).toBe(true);
    expect(entries.has("data_source_impact_summary.json")).toBe(true);

    const dataSourceImpactSummary = JSON.parse(entries.get("data_source_impact_summary.json")?.toString("utf-8") ?? "{}") as {
      source?: string;
      sources?: {
        opendart?: { configured?: boolean; indexExists?: boolean; generatedAt?: string | null; count?: number | null };
        planning?: { snapshotState?: string; asOf?: string | null; fetchedAt?: string | null };
      };
      cards?: Array<{ cardId?: string; readOnly?: { title?: string }; healthSummary?: { latestCheckedAt?: string | null } }>;
    };
    expect(dataSourceImpactSummary.source).toBe("/settings/data-sources");
    expect(dataSourceImpactSummary.sources?.opendart).toMatchObject({
      configured: false,
      indexExists: true,
      generatedAt: "2026-03-12T00:00:00.000Z",
      count: 2,
    });
    expect(dataSourceImpactSummary.sources?.planning).toMatchObject({
      snapshotState: "available",
      asOf: "2026-03-11",
      fetchedAt: "2026-03-12T01:00:00.000Z",
    });
    expect(dataSourceImpactSummary.cards?.map((card) => card.cardId)).toEqual(["dart", "planning"]);
    expect(dataSourceImpactSummary.cards?.[0]?.readOnly?.title).toBe("운영 최신 기준");
    expect(dataSourceImpactSummary.cards?.[1]?.healthSummary?.latestCheckedAt).toBe("2026-03-12T01:00:00.000Z");

    const merged = Buffer.concat([...entries.values()]).toString("utf-8");
    const leakPatterns = [
      /incomeNet/i,
      /"debts"\s*:/i,
      /liabilities/i,
      /secret\s*[:=]/i,
      /token\s*[:=]/i,
      /process\.env/i,
      /BEGIN PRIVATE KEY/i,
      /ECOS_API_KEY=/i,
      /GITHUB_TOKEN=/i,
      /Bearer\s+/i,
      /monthlyIncomeNet/i,
      /liquidAssets/i,
    ];
    for (const pattern of leakPatterns) {
      expect(pattern.test(merged)).toBe(false);
    }
  });

  it("blocks without csrf", async () => {
    const response = await supportExportGET(new Request(`${LOCAL_ORIGIN}/api/ops/support/export.zip`, {
      method: "GET",
      headers: localHeaders(),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("CSRF");
  });

  it("blocks non-local host", async () => {
    const response = await supportExportGET(new Request(`${REMOTE_ORIGIN}/api/ops/support/export.zip?csrf=csrf-token`, {
      method: "GET",
      headers: localHeaders(REMOTE_HOST),
    }));

    const payload = await response.json() as { error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });
});
