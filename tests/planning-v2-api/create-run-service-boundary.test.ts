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
    const inputContextPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunInputContext.ts");
    const stagePlanPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunStagePlan.ts");
    const stagePipelinePath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunStagePipeline.ts");
    const assemblerPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunRecordAssembler.ts");
    const persistencePath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunPersistence.ts");
    const sideEffectsPath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunSideEffects.ts");
    const successResponsePath = path.join(process.cwd(), "src/lib/planning/server/runs/createRunSuccessResponse.ts");

    expect(fs.existsSync(servicePath)).toBe(true);
    expect(fs.existsSync(parserPath)).toBe(true);
    expect(fs.existsSync(preflightPath)).toBe(true);
    expect(fs.existsSync(inputContextPath)).toBe(true);
    expect(fs.existsSync(stagePlanPath)).toBe(true);
    expect(fs.existsSync(stagePipelinePath)).toBe(true);
    expect(fs.existsSync(assemblerPath)).toBe(true);
    expect(fs.existsSync(persistencePath)).toBe(true);
    expect(fs.existsSync(sideEffectsPath)).toBe(true);
    expect(fs.existsSync(successResponsePath)).toBe(true);
    const serviceSource = fs.readFileSync(servicePath, "utf-8");
    const parserSource = fs.readFileSync(parserPath, "utf-8");
    const inputContextSource = fs.readFileSync(inputContextPath, "utf-8");
    const stagePipelineSource = fs.readFileSync(stagePipelinePath, "utf-8");
    const persistenceSource = fs.readFileSync(persistencePath, "utf-8");
    const sideEffectsSource = fs.readFileSync(sideEffectsPath, "utf-8");
    const successResponseSource = fs.readFileSync(successResponsePath, "utf-8");

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
    expect(serviceSource).toContain("prepareCreatePlanningRunInputContext");
    expect(serviceSource).not.toContain("loadCanonicalProfile");
    expect(serviceSource).not.toContain("applyProfilePatch");
    expect(serviceSource).not.toContain("applyScenario");
    expect(inputContextSource).toContain("loadCanonicalProfile");
    expect(inputContextSource).toContain("applyProfilePatch");
    expect(inputContextSource).toContain("evaluateCreatePlanningRunPreflight");
    expect(inputContextSource).toContain("resolvePlanningRunAssumptions");
    expect(serviceSource).toContain("runCreatePlanningRunStagePipeline");
    expect(serviceSource).not.toContain("buildPlanningStagePlan");
    expect(stagePipelineSource).toContain("buildPlanningStagePlan");
    expect(stagePipelineSource).toContain("createPlanningStagePlanState");
    expect(stagePipelineSource).toContain("resolvePlanningStageOutputs");
    expect(stagePipelineSource).toContain("checkMonteCarloBudget");
    expect(stagePipelineSource).toContain("export async function runCreatePlanningRunStagePipeline");
    expect(serviceSource).toContain("assemblePlanningRunRecordInput");
    expect(serviceSource).toContain("persistCreatePlanningRunRecord");
    expect(serviceSource).toContain("buildCreatePlanningRunSuccessResult");
    expect(serviceSource).toContain("recordCreateRunSuccessSideEffects");
    expect(serviceSource).not.toContain("planning run created");
    expect(serviceSource).toContain("recordCreateRunAuditSafely");
    expect(serviceSource).toContain("recordCreateRunStageMetricsSafely");
    expect(serviceSource).toContain("export async function createPlanningRun");
    expect(serviceSource).not.toContain("runStagePipeline");
    expect(stagePipelineSource).toContain("runStagePipeline");
    expect(serviceSource).toContain("recordCurrentUserRunStageMetrics");
    expect(serviceSource).not.toContain("request: Request");
    expect(serviceSource).not.toContain("PLANNING_RUN_STORE_RAW_OUTPUTS");
    expect(serviceSource).not.toContain("deps.createRunRecord(");
    expect(persistenceSource).toContain("PLANNING_RUN_STORE_RAW_OUTPUTS");
    expect(serviceSource).not.toContain("[planning/runs] failed to record create audit");
    expect(serviceSource).not.toContain("[planning/runs] failed to record stage metrics");
    expect(sideEffectsSource).toContain("export async function recordCreateRunSuccessSideEffects");
    expect(sideEffectsSource).toContain("planning run created");
    expect(sideEffectsSource).toContain("[planning/runs] failed to record create audit");
    expect(sideEffectsSource).toContain("[planning/runs] failed to record stage metrics");
    expect(successResponseSource).toContain("buildCreatePlanningRunSuccessMeta");
    expect(successResponseSource).toContain("export function buildCreatePlanningRunSuccessResult");
  });
});
