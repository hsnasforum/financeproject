import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReportVM } from "../../src/app/planning/reports/_lib/reportViewModel";
import { toInterpretationInputFromReportVM } from "../../src/app/planning/reports/_lib/reportInterpretationAdapter";
import { buildInterpretationVM } from "../../src/lib/planning/v2/insights/interpretationVm";
import { type PlanningRunRecord, type PlanningRunStageId, type PlanningRunStageStatus } from "../../src/lib/planning/store/types";
import { type ResultDtoV1 } from "../../src/lib/planning/v2/resultDto";

const GOLDEN_RUN_FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "planning", "golden", "runs");

type GoldenRunMetaFixture = {
  id: string;
  title: string;
  createdAt: string;
  profileId: string;
  overallStatus: PlanningRunRecord["overallStatus"];
  stages: Record<PlanningRunStageId, PlanningRunStageStatus>;
  resultDtoFixture: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
}

function readGoldenRunMeta(filePath: string): GoldenRunMetaFixture {
  const row = asRecord(readJson(filePath));
  const id = asString(row.id);
  const title = asString(row.title);
  const createdAt = asString(row.createdAt);
  const profileId = asString(row.profileId);
  const overallStatus = row.overallStatus as PlanningRunRecord["overallStatus"];
  const stagesRow = asRecord(row.stages);
  const resultDtoFixture = asString(row.resultDtoFixture);
  if (!id || !title || !createdAt || !profileId || !resultDtoFixture) {
    throw new Error(`invalid golden run fixture: ${path.basename(filePath)}`);
  }
  return {
    id,
    title,
    createdAt,
    profileId,
    overallStatus,
    stages: {
      simulate: asString(stagesRow.simulate) as PlanningRunStageStatus,
      scenarios: asString(stagesRow.scenarios) as PlanningRunStageStatus,
      monteCarlo: asString(stagesRow.monteCarlo) as PlanningRunStageStatus,
      actions: asString(stagesRow.actions) as PlanningRunStageStatus,
      debt: asString(stagesRow.debt) as PlanningRunStageStatus,
    },
    resultDtoFixture,
  };
}

function buildRunRecord(meta: GoldenRunMetaFixture, dto: ResultDtoV1): PlanningRunRecord {
  const stages: PlanningRunRecord["stages"] = (Object.entries(meta.stages) as Array<[PlanningRunStageId, PlanningRunStageStatus]>)
    .map(([id, status]) => ({
      id,
      status,
      ...(status === "SKIPPED" ? { reason: "OPTION_DISABLED" as const } : {}),
    }));
  return {
    version: 1,
    schemaVersion: 2,
    id: meta.id,
    profileId: meta.profileId,
    title: meta.title,
    createdAt: meta.createdAt,
    overallStatus: meta.overallStatus,
    stages,
    input: {
      horizonMonths: 120,
      runScenarios: true,
      getActions: true,
      analyzeDebt: true,
      includeProducts: false,
      monteCarlo: undefined,
    },
    meta: {
      snapshot: {
        id: `snapshot-${meta.id}`,
        asOf: "2026-02-28",
        fetchedAt: "2026-03-01T00:00:00.000Z",
        missing: false,
      },
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: {
      resultDto: dto,
    },
  };
}

describe("golden run fixtures", () => {
  it("loads golden run meta and builds report/interpretation view models without throwing", () => {
    const files = fs.readdirSync(GOLDEN_RUN_FIXTURE_DIR)
      .filter((name) => name.endsWith(".run.json"))
      .sort((a, b) => a.localeCompare(b));
    expect(files.length).toBeGreaterThanOrEqual(3);

    for (const fileName of files) {
      const fixturePath = path.join(GOLDEN_RUN_FIXTURE_DIR, fileName);
      const meta = readGoldenRunMeta(fixturePath);
      const dtoPath = path.join(process.cwd(), meta.resultDtoFixture);
      const dto = readJson(dtoPath) as ResultDtoV1;
      const run = buildRunRecord(meta, dto);

      const monteCarloStage = run.stages?.find((stage) => stage.id === "monteCarlo");
      expect(monteCarloStage?.status).toBe("SKIPPED");

      const vm = buildReportVM(run, {
        id: run.id,
        createdAt: run.createdAt,
        runId: run.id,
      });
      expect(vm.header.runId).toBe(run.id);
      expect(vm.stage.byId.monteCarlo?.status).toBe("SKIPPED");

      const interpretation = buildInterpretationVM(toInterpretationInputFromReportVM(vm));
      expect(interpretation.verdict.code).toBeTruthy();
      expect(Array.isArray(interpretation.diagnostics)).toBe(true);
    }
  });
});
