import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(filePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf-8");
}

describe("planning run create service boundary", () => {
  it("keeps alias POST routes from importing the v2 runs route handler", () => {
    const planningApiRoot = ["src", "app", "api", "planning"].join("/");
    const legacyRunRoute = readProjectFile([planningApiRoot, "run", "route.ts"].join("/"));
    const v2AliasRunRoute = readProjectFile([planningApiRoot, "v2", "run", "route.ts"].join("/"));
    const legacyRunsRouteImport = ["..", "v2", "runs", "route"].join("/");
    const v2RunsRouteImport = ["..", "runs", "route"].join("/");

    for (const source of [legacyRunRoute, v2AliasRunRoute]) {
      expect(source).not.toContain(v2RunsRouteImport);
      expect(source).not.toContain(legacyRunsRouteImport);
      expect(source).not.toContain("runsPost");
      expect(source).toContain("handleCreatePlanningRunPost");
    }
  });

  it("moves create-run orchestration out of the HTTP route and into a request-free application service", () => {
    const planningApiRoot = ["src", "app", "api", "planning"].join("/");
    const runsRoute = readProjectFile([planningApiRoot, "v2", "runs", "route.ts"].join("/"));
    const routeAdapter = readProjectFile("src/lib/planning/server/runs/createRunRouteAdapter.ts");
    const servicePath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunService.ts");
    const parserPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunCommandParser.ts");
    const preflightPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunPreflight.ts");
    const stagePlanPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunStagePlan.ts");
    const assemblerPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunRecordAssembler.ts");

    expect(fs.existsSync(servicePath)).toBe(true);
    expect(fs.existsSync(parserPath)).toBe(true);
    expect(fs.existsSync(preflightPath)).toBe(true);
    expect(fs.existsSync(stagePlanPath)).toBe(true);
    expect(fs.existsSync(assemblerPath)).toBe(true);
    const serviceSource = fs.readFileSync(servicePath, "utf-8");
    const parserSource = fs.readFileSync(parserPath, "utf-8");

    expect(runsRoute).toContain("handleCreatePlanningRunPost");
    expect(runsRoute).not.toContain("runStagePipeline");
    expect(runsRoute).not.toContain("simulateMonthly");
    expect(runsRoute).not.toContain("resolvePlanningRunAssumptions");
    expect(runsRoute).not.toContain("matchCandidates");

    expect(routeAdapter).toContain("parseCreatePlanningRunCommand");
    expect(routeAdapter).toContain("createPlanningRun");
    expect(routeAdapter).toContain("withPlanningRouteUser");
    expect(routeAdapter).not.toContain("requirePlanningRouteUser");
    expect(routeAdapter).toContain("jsonOk");
    expect(routeAdapter).toContain("jsonError");

    expect(parserSource).toContain("export function parseCreatePlanningRunCommand");
    expect(serviceSource).toContain("evaluateCreatePlanningRunPreflight");
    expect(serviceSource).toContain("buildPlanningStagePlan");
    expect(serviceSource).toContain("assemblePlanningRunRecordInput");
    expect(serviceSource).toContain("export async function createPlanningRun");
    expect(serviceSource).toContain("runStagePipeline");
    expect(serviceSource).toContain("recordCurrentUserRunStageMetrics");
    expect(serviceSource).not.toContain("request: Request");
  });
});
