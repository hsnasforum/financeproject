import fs, { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as planningRunPOST } from "../../../src/app/api/planning/run/route";
import { POST as planningV2RunPOST } from "../../../src/app/api/planning/v2/run/route";
import { POST as plannerComputePOST } from "../../../src/app/api/planner/compute/route";
import {
  PLANNING_CANONICAL_ROUTES,
  PLANNING_DEPRECATED_API_ROUTES,
  planningDeprecationHeaders,
} from "../../../src/lib/planning/routes";
import { installPlanningAuthRequiredFalseForTest } from "../auth/testPlanningAuthEnv";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));
const siteHeaderPath = fileURLToPath(new URL("../../../src/components/SiteHeader.tsx", import.meta.url));
const mobileBottomNavPath = fileURLToPath(new URL("../../../src/components/ui/MobileBottomNav.tsx", import.meta.url));
const planningRunRoutePath = fileURLToPath(new URL("../../../src/app/api/planning/run/route.ts", import.meta.url));
const planningV2RunRoutePath = fileURLToPath(new URL("../../../src/app/api/planning/v2/run/route.ts", import.meta.url));
const plannerComputeRoutePath = fileURLToPath(new URL("../../../src/app/api/planner/compute/route.ts", import.meta.url));
const env = process.env as Record<string, string | undefined>;
const originalAuditPath = process.env.AUDIT_LOG_PATH;
const localHost = "localhost:3000";

installPlanningAuthRequiredFalseForTest();

function buildJsonRequest(urlPath: string, body: unknown): Request {
  const origin = `http://${localHost}`;
  return new Request(`${origin}${urlPath}`, {
    method: "POST",
    headers: {
      host: localHost,
      origin,
      referer: `${origin}/planning`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("planning route policy registry", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-route-policy-"));
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
  });

  afterEach(() => {
    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps official planning user and API routes in one registry", () => {
    expect(PLANNING_CANONICAL_ROUTES.user).toMatchObject({
      home: "/planning",
      runs: "/planning/runs",
      runDetail: "/planning/runs/[id]",
      reports: "/planning/reports",
      reportDetail: "/planning/reports/[id]",
    });
    expect(PLANNING_CANONICAL_ROUTES.api).toMatchObject({
      createRun: "/api/planning/v2/runs",
      listRuns: "/api/planning/v2/runs",
    });
    expect(PLANNING_CANONICAL_ROUTES.betaEntry).toEqual([
      "/planning/v3/transactions",
      "/planning/v3/transactions/batches",
      "/planning/v3/balances",
      "/planning/v3/profile/drafts",
    ]);
  });

  it("marks legacy planning API routes as deprecated aliases with canonical hints", () => {
    expect(PLANNING_DEPRECATED_API_ROUTES.planningRun).toMatchObject({
      route: "/api/planning/run",
      status: "deprecated-alias",
      canonicalRoute: "/api/planning/v2/runs",
    });
    expect(PLANNING_DEPRECATED_API_ROUTES.planningV2Run).toMatchObject({
      route: "/api/planning/v2/run",
      status: "deprecated-alias",
      canonicalRoute: "/api/planning/v2/runs",
    });
    expect(PLANNING_DEPRECATED_API_ROUTES.plannerCompute).toMatchObject({
      route: "/api/planner/compute",
      status: "deprecated-compatibility",
      canonicalRoute: "/api/planning/v2/runs",
    });

    expect(planningDeprecationHeaders(PLANNING_DEPRECATED_API_ROUTES.planningRun)).toMatchObject({
      Deprecation: "true",
      "X-Planning-Canonical-Route": "/api/planning/v2/runs",
      "X-Planning-Route-Status": "deprecated-alias",
    });
  });

  it("documents the same planning route policy in current screens", () => {
    const markdown = readFileSync(currentScreensPath, "utf8");

    expect(markdown).toContain("## Planning 공식 route/API 정책");
    expect(markdown).toContain("`src/lib/planning/routes.ts`");
    expect(markdown).toContain("`PLANNING_CANONICAL_ROUTES.user`");
    expect(markdown).toContain("`/api/planning/v2/runs`");
    expect(markdown).toContain("`PLANNING_DEPRECATED_API_ROUTES`");
    expect(markdown).toContain("`Deprecation: true`");
    expect(markdown).toContain("telemetry/access log");
  });

  it("keeps public navigation off planning v3 entry routes", () => {
    const siteHeader = readFileSync(siteHeaderPath, "utf8");
    const mobileBottomNav = readFileSync(mobileBottomNavPath, "utf8");

    expect(siteHeader).not.toContain("/planning/v3");
    expect(mobileBottomNav).not.toContain("/planning/v3");
  });

  it("wires deprecated API route handlers to the policy registry", () => {
    expect(readFileSync(planningRunRoutePath, "utf8")).toContain("PLANNING_DEPRECATED_API_ROUTES.planningRun");
    expect(readFileSync(planningV2RunRoutePath, "utf8")).toContain("PLANNING_DEPRECATED_API_ROUTES.planningV2Run");
    expect(readFileSync(plannerComputeRoutePath, "utf8")).toContain("PLANNING_DEPRECATED_API_ROUTES.plannerCompute");
    expect(readFileSync(plannerComputeRoutePath, "utf8")).toContain("withPlanningDeprecationHeaders");
  });

  it("returns deprecation metadata from planning run aliases", async () => {
    const cases = [
      {
        route: "/api/planning/run",
        handler: planningRunPOST,
        metaKey: "deprecatedApi",
        id: "planning-run-alias",
      },
      {
        route: "/api/planning/v2/run",
        handler: planningV2RunPOST,
        metaKey: "deprecatedApi",
        id: "planning-v2-run-alias",
      },
    ];

    for (const item of cases) {
      const response = await item.handler(buildJsonRequest(item.route, {}));
      const payload = await response.json() as {
        meta?: Record<string, { id?: string; canonicalRoute?: string; status?: string }>;
      };

      expect(response.headers.get("deprecation")).toBe("true");
      expect(response.headers.get("x-planning-canonical-route")).toBe("/api/planning/v2/runs");
      expect(payload.meta?.[item.metaKey]).toMatchObject({
        id: item.id,
        canonicalRoute: "/api/planning/v2/runs",
        status: "deprecated-alias",
      });
    }
  });

  it("returns deprecation metadata from legacy planner compute", async () => {
    const response = await plannerComputePOST(buildJsonRequest("/api/planner/compute", {}));
    const payload = await response.json() as {
      meta?: {
        legacyApi?: {
          id?: string;
          canonicalRoute?: string;
          status?: string;
        };
      };
    };

    expect(response.headers.get("deprecation")).toBe("true");
    expect(response.headers.get("x-planning-canonical-route")).toBe("/api/planning/v2/runs");
    expect(payload.meta?.legacyApi).toMatchObject({
      id: "planner-compute",
      canonicalRoute: "/api/planning/v2/runs",
      status: "deprecated-compatibility",
    });
  });
});
