import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runScenarios } from "../../src/lib/planning/core/v2/runScenarios";
import { buildActionsFromPlan } from "../../src/lib/planning/core/v2/actions/buildActions";
import { buildPlanningRunArtifacts } from "../../src/lib/planning/server/v2/runArtifacts";
import { createRun, getRun, getRunBlob } from "../../src/lib/planning/store/runStore";
import { safeBuildReportVMFromRun } from "../../src/lib/planning/reports/reportViewModel";
import type { PlanningRunRecord } from "../../src/lib/planning/store/types";
import { compactRunOutputs } from "../../src/lib/planning/store/runMetaRecord";
import { resolveProfileRunMetaPath } from "../../src/lib/planning/store/paths";
import { fromStoredPayload } from "../../src/lib/planning/store/runRecordCodec";
import { sanitizeRunRecordForResponse } from "../../src/lib/planning/api/runResponseSanitizer";
import { LIMITS } from "../../src/lib/planning/v2/limits";

const profile = {
  monthlyIncomeNet: 4_100_000, monthlyEssentialExpenses: 1_800_000,
  monthlyDiscretionaryExpenses: 600_000, liquidAssets: 2_500_000,
  investmentAssets: 4_400_000, debts: [],
  goals: [{ id: "emergency", name: "비상금", targetAmount: 12_000_000, currentAmount: 1_000_000, targetMonth: 12 }],
};
const baseAssumptions = { inflationPct: 2, investReturnPct: 5, cashReturnPct: 2, withdrawalRatePct: 4 };
const scenarios = runScenarios({ profile, horizonMonths: 24, baseAssumptions });
const actions = buildActionsFromPlan({ plan: scenarios.base, profile, baseAssumptions });
const fallback = "기준 대비 순자산/경고 변화를 함께 확인하세요.";

function fixture(enabled = true): PlanningRunRecord {
  const artifacts = buildPlanningRunArtifacts({
    profile, policyId: "balanced", snapshotMeta: { asOf: "2026-09-07" }, healthSummary: {},
    simulatePlan: scenarios.base, scenariosOutput: enabled ? scenarios : null,
    actionsOutput: actions, monteCarloOutput: null, debtStrategyOutput: null,
  });
  return {
    version: 1, id: "shortwhy-run", profileId: "shortwhy-profile", createdAt: "2026-09-07T00:00:00.000Z",
    overallStatus: "SUCCESS", input: { horizonMonths: 24 }, meta: {},
    stages: [
      { id: "simulate", status: "SUCCESS", outputRef: { key: "outputs.simulate", hasData: true } },
      { id: "scenarios", status: enabled ? "SUCCESS" : "SKIPPED", ...(enabled ? { outputRef: { key: "outputs.scenarios", hasData: true } } : { reason: "OPTION_DISABLED" }) },
      { id: "actions", status: "SUCCESS", outputRef: { key: "outputs.actions", hasData: true } },
    ],
    outputs: {
      engineSchemaVersion: artifacts.outputs.engineSchemaVersion, engine: artifacts.outputs.engine,
      resultDto: artifacts.resultDto,
      simulate: { ...artifacts.outputs.simulate, ref: { name: "simulate", path: "fixture/simulate.json" } },
      ...(artifacts.outputs.scenarios ? { scenarios: { ...artifacts.outputs.scenarios, ref: { name: "scenarios", path: "fixture/scenarios.json" } } } : {}),
      actions: { ...artifacts.outputs.actions, ref: { name: "actions", path: "fixture/actions.json" } },
    },
  };
}

describe("scenario shortWhy storage contract", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-scenario-shortwhy-"));
    vi.stubEnv("PLANNING_NAMESPACE_ENABLED", "0");
    vi.stubEnv("PLANNING_ENCRYPTION_ENABLED", "0");
    vi.stubEnv("PLANNING_DATA_DIR", root);
    vi.stubEnv("PLANNING_RUNS_DIR", path.join(root, "runs"));
    vi.stubEnv("PLANNING_PROFILE_PARTITIONS_DIR", path.join(root, "vault/profiles"));
    vi.stubEnv("PLANNING_STORAGE_JOURNAL_PATH", path.join(root, "storage/journal.ndjson"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each([false, true])("preserves actual pre-save explanations through meta and blob reads, reversed order=%s", async (reverse) => {
    const source = fixture();
    const beforeMap = source.outputs.scenarios!.shortWhyByScenario as Record<string, string[]>;
    expect(Object.keys(beforeMap)).toEqual(["conservative", "aggressive"]);
    expect(beforeMap.conservative[0]).not.toBe(beforeMap.aggressive[0]);
    if (reverse) {
      source.outputs.resultDto!.scenarios!.table = [...source.outputs.resultDto!.scenarios!.table as unknown[]].reverse();
      source.outputs.scenarios!.shortWhyByScenario = Object.fromEntries(Object.entries(beforeMap).reverse());
    }
    const saved = await createRun(source, { enforceRetention: false });
    const metaPath = resolveProfileRunMetaPath(saved.profileId, saved.id);
    const metaBytes = fs.readFileSync(metaPath);
    const meta = (await fromStoredPayload(JSON.parse(metaBytes.toString("utf8")))).payload as PlanningRunRecord;
    const loaded = (await getRun(saved.id))!;
    for (const run of [saved, meta, loaded]) {
      expect(run.outputs.scenarios?.shortWhyByScenario).toEqual(beforeMap);
      expect(Object.keys(run.outputs.scenarios!).sort()).toEqual(["ref", "shortWhyByScenario"]);
      expect(run.outputs.scenarios?.ref).toEqual(saved.outputs.scenarios?.ref);
      expect(run.outputs.resultDto?.raw).toEqual({});
      expect(run.outputs.resultDto?.scenarios).toEqual(source.outputs.resultDto?.scenarios);
      expect(run.schemaVersion).toBe(2);
      expect(run.stages?.find((stage) => stage.id === "scenarios")?.outputRef?.ref).toEqual(run.outputs.scenarios?.ref);
      const vm = safeBuildReportVMFromRun(run).vm!;
      expect(vm.scenarioRows.map((row) => row.id)).toEqual(reverse ? ["aggressive", "conservative", "base"] : ["base", "conservative", "aggressive"]);
      for (const id of ["conservative", "aggressive"]) {
        expect(vm.scenarioRows.find((row) => row.id === id)?.interpretation).toBe(beforeMap[id][0]);
      }
      expect(vm.scenarioRows.find((row) => row.id === "base")).toMatchObject({ endNetWorthDeltaKrw: 0, interpretation: fallback });
    }
    const blob = await getRunBlob(saved.id, "scenarios") as { shortWhyByScenario: Record<string, string[]> };
    expect(blob.shortWhyByScenario).toEqual(beforeMap);
    expect(fs.readFileSync(metaPath)).toEqual(metaBytes);
    const response = sanitizeRunRecordForResponse(loaded);
    expect(response.outputs.scenarios?.shortWhyByScenario).toEqual(beforeMap);
    expect(response.outputs.scenarios?.ref).toMatchObject({ name: "scenarios", sizeBytes: saved.outputs.scenarios!.ref.sizeBytes });
    expect(JSON.stringify(response)).not.toContain('"path":');
  });

  it("uses the existing per-ID compact limit without copying the scenario table or blob payload", () => {
    const source = fixture();
    const values = Array.from({ length: LIMITS.actionsTop + 3 }, (_, index) => `stored explanation ${index}`);
    source.outputs.scenarios!.shortWhyByScenario = { conservative: values, aggressive: [...values].reverse(), "original-id": values };
    const outputs = compactRunOutputs(source.outputs);
    expect(outputs.scenarios).toEqual({ shortWhyByScenario: {
      conservative: values.slice(0, LIMITS.actionsTop),
      aggressive: [...values].reverse().slice(0, LIMITS.actionsTop),
      "original-id": values.slice(0, LIMITS.actionsTop),
    } });
    expect(outputs.resultDto).toEqual({ ...source.outputs.resultDto, raw: {} });
    expect(compactRunOutputs(source.outputs, { storeRawOutputs: true }).scenarios?.shortWhyByScenario).toEqual(outputs.scenarios?.shortWhyByScenario);
  });

  it("keeps legacy missing-map fallback and reads it without rewriting metadata", async () => {
    const source = fixture();
    delete source.outputs.scenarios!.shortWhyByScenario;
    const saved = await createRun(source, { enforceRetention: false });
    const file = resolveProfileRunMetaPath(saved.profileId, saved.id);
    const before = fs.readFileSync(file);
    const loaded = (await getRun(saved.id))!;
    expect(loaded.outputs.scenarios?.shortWhyByScenario).toBeUndefined();
    expect(safeBuildReportVMFromRun(loaded).vm!.scenarioRows.map((row) => row.interpretation)).toEqual([fallback, fallback, fallback]);
    expect(fs.readFileSync(file)).toEqual(before);
  });

  it("keeps disabled scenario runs and generated actions unchanged", async () => {
    const source = fixture(false);
    const saved = await createRun(source, { enforceRetention: false });
    const loaded = (await getRun(saved.id))!;
    expect(loaded.outputs.scenarios).toBeUndefined();
    const vm = safeBuildReportVMFromRun(loaded).vm!;
    expect(vm.scenarioRows).toEqual([]);
    expect(vm.actionRows).toEqual(safeBuildReportVMFromRun(source).vm!.actionRows);
    expect(vm.actionRows.length).toBeGreaterThan(0);
  });

  it.each([undefined, null, [], "invalid", {}])("does not add scenario metadata for a missing or invalid map: %s", (map) => {
    const source = fixture();
    source.outputs.scenarios!.shortWhyByScenario = map;
    expect(compactRunOutputs(source.outputs).scenarios).toBeUndefined();
  });
});
