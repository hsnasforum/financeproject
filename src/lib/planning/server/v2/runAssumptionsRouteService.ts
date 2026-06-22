import {
  findAssumptionsSnapshotId,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
} from "../assumptions/storage";
import {
  mergeAssumptionsWithProvenance,
  toAssumptionsOverridesFromRecord,
} from "../assumptions/overrides";
import { loadAssumptionsOverridesByProfile } from "../assumptions/overridesStorage";
import { mapSnapshotToAssumptionsV2, mapSnapshotToScenarioExtrasV2 } from "../assumptions/mapSnapshotToAssumptionsV2";
import { DEFAULT_ASSUMPTIONS_V2 } from "./defaults";
import {
  assessAssumptionsHealth,
  assessRiskAssumptionConsistency,
  combineAssumptionsHealth,
} from "./assumptionsHealth";
import {
  type AssumptionsV2,
  type RiskTolerance,
  toScenarioAssumptionsV2,
  toSimulationAssumptionsV2,
} from "./scenarios";

type SnapshotShape = Awaited<ReturnType<typeof loadLatestAssumptionsSnapshot>>;

export class PlanningRunAssumptionsResolveError extends Error {
  readonly kind: "SNAPSHOT_NOT_FOUND" | "SNAPSHOT" | "OVERRIDES";
  readonly status: number;
  readonly issues?: string[];
  readonly auditMessage: string;

  constructor(input: {
    kind: PlanningRunAssumptionsResolveError["kind"];
    message: string;
    auditMessage?: string;
    status: number;
    issues?: string[];
  }) {
    super(input.message);
    this.name = "PlanningRunAssumptionsResolveError";
    this.kind = input.kind;
    this.status = input.status;
    this.issues = input.issues;
    this.auditMessage = input.auditMessage ?? input.message;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toSimulationOverrides(overrides: Record<string, unknown>): Partial<typeof DEFAULT_ASSUMPTIONS_V2> {
  const output: Partial<typeof DEFAULT_ASSUMPTIONS_V2> = {};
  if (isFiniteNumber(overrides.inflation)) output.inflation = overrides.inflation;
  if (isFiniteNumber(overrides.expectedReturn)) output.expectedReturn = overrides.expectedReturn;
  if (isRecord(overrides.debtRates)) output.debtRates = overrides.debtRates as Record<string, number>;

  if (!isFiniteNumber(output.inflation) && isFiniteNumber(overrides.inflationPct)) {
    output.inflation = overrides.inflationPct;
  }
  if (!isFiniteNumber(output.expectedReturn) && isFiniteNumber(overrides.investReturnPct)) {
    output.expectedReturn = overrides.investReturnPct;
  }

  return output;
}

function buildSnapshotMeta(snapshot: SnapshotShape, snapshotId?: string) {
  if (!snapshot) return { missing: true as const };
  return {
    ...(snapshotId ? { id: snapshotId } : {}),
    asOf: snapshot.asOf,
    fetchedAt: snapshot.fetchedAt,
    missing: false as const,
    warningsCount: snapshot.warnings.length,
    sourcesCount: snapshot.sources.length,
  };
}

async function loadPlanningRunSnapshot(requestedSnapshotId?: string): Promise<{
  snapshot: SnapshotShape;
  snapshotId?: string;
}> {
  try {
    if (requestedSnapshotId) {
      const snapshot = await loadAssumptionsSnapshotById(requestedSnapshotId);
      if (!snapshot) {
        throw new PlanningRunAssumptionsResolveError({
          kind: "SNAPSHOT_NOT_FOUND",
          message: "snapshotId를 찾을 수 없습니다. latest 또는 /ops/assumptions 목록에서 선택하세요.",
          auditMessage: "snapshot not found",
          status: 400,
          issues: [`input.snapshotId: '${requestedSnapshotId}' not found`],
        });
      }
      return {
        snapshot,
        snapshotId: requestedSnapshotId,
      };
    }

    const snapshot = await loadLatestAssumptionsSnapshot();
    return {
      snapshot,
      snapshotId: snapshot ? await findAssumptionsSnapshotId(snapshot) : undefined,
    };
  } catch (error) {
    if (error instanceof PlanningRunAssumptionsResolveError) throw error;
    const message = error instanceof Error ? error.message : "Failed to load assumptions snapshot";
    throw new PlanningRunAssumptionsResolveError({
      kind: "SNAPSHOT",
      message,
      status: 500,
    });
  }
}

export async function resolvePlanningRunAssumptions(input: {
  profileId: string;
  requestedSnapshotId?: string;
  assumptionsOverride: Record<string, unknown>;
  riskTolerance: RiskTolerance;
}): Promise<{
  snapshot: SnapshotShape;
  snapshotId?: string;
  snapshotMeta: ReturnType<typeof buildSnapshotMeta>;
  baseAssumptions: AssumptionsV2;
  finalSimulationAssumptions: ReturnType<typeof toSimulationAssumptionsV2>;
  health: ReturnType<typeof combineAssumptionsHealth>;
  appliedOverrides: ReturnType<typeof mergeAssumptionsWithProvenance>["appliedOverrides"];
}> {
  const { snapshot, snapshotId } = await loadPlanningRunSnapshot(input.requestedSnapshotId);

  let storedAssumptionsOverrides: Awaited<ReturnType<typeof loadAssumptionsOverridesByProfile>>;
  try {
    storedAssumptionsOverrides = await loadAssumptionsOverridesByProfile(input.profileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load assumptions overrides";
    throw new PlanningRunAssumptionsResolveError({
      kind: "OVERRIDES",
      message,
      status: 500,
    });
  }

  const mappedFromSnapshot = mapSnapshotToAssumptionsV2(snapshot);
  const mappedScenarioExtras = mapSnapshotToScenarioExtrasV2(snapshot);
  const simulationOverrides = toSimulationOverrides(input.assumptionsOverride);
  const snapshotAssumptions = toScenarioAssumptionsV2(
    {
      ...DEFAULT_ASSUMPTIONS_V2,
      ...mappedFromSnapshot,
    },
    mappedScenarioExtras.extra,
  );
  const requestAssumptionsOverrides = toAssumptionsOverridesFromRecord(input.assumptionsOverride, {
    reasonPrefix: "run assumptionsOverride",
  });
  const {
    effectiveAssumptions,
    appliedOverrides,
  } = mergeAssumptionsWithProvenance(
    snapshotAssumptions,
    [...storedAssumptionsOverrides, ...requestAssumptionsOverrides],
  );
  const baseAssumptions = {
    ...effectiveAssumptions,
    ...(simulationOverrides.debtRates ? { debtRates: simulationOverrides.debtRates } : {}),
  };
  const finalSimulationAssumptions = {
    ...toSimulationAssumptionsV2(baseAssumptions),
    ...(simulationOverrides.debtRates ? { debtRates: simulationOverrides.debtRates } : {}),
  };
  const snapshotMeta = buildSnapshotMeta(snapshot, snapshotId);
  const baseHealth = assessAssumptionsHealth({
    assumptions: baseAssumptions,
    snapshotMeta,
  });
  const riskWarnings = assessRiskAssumptionConsistency(input.riskTolerance, baseAssumptions);
  const health = combineAssumptionsHealth(baseHealth, [...riskWarnings, ...mappedScenarioExtras.warnings]);

  return {
    snapshot,
    snapshotId,
    snapshotMeta,
    baseAssumptions,
    finalSimulationAssumptions,
    health,
    appliedOverrides,
  };
}
