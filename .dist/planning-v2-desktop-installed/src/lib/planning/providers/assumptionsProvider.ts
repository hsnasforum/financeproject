import {
  findAssumptionsSnapshotId,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
} from "../assumptions/storage";
import {
  mapSnapshotToAssumptionsV2,
  mapSnapshotToScenarioExtrasV2,
  type SnapshotScenarioExtrasMapping,
} from "../assumptions/mapSnapshotToAssumptionsV2";
import { DEFAULT_ASSUMPTIONS_V2 } from "../v2/defaults";
import { type AssumptionsV2, toScenarioAssumptionsV2 } from "../v2/scenarios";
import { type ProfileV2, type SimulationAssumptionsV2 } from "../v2/types";

export type AssumptionsSnapshotMeta = {
  id?: string;
  asOf?: string;
  fetchedAt?: string;
  missing: boolean;
  warningsCount?: number;
  sourcesCount?: number;
};

export type AssumptionsProviderResult = {
  assumptions: AssumptionsV2;
  simulationAssumptions: SimulationAssumptionsV2;
  snapshotMeta: AssumptionsSnapshotMeta;
  snapshotWarnings: SnapshotScenarioExtrasMapping["warnings"];
  snapshotId?: string;
};

export type AssumptionsProvider = {
  getSnapshotRef(): Promise<{ id?: string; asOf?: string; fetchedAt?: string; missing?: boolean }>;
  getBaseAssumptions(
    profile: ProfileV2,
    overrides?: Partial<AssumptionsV2>,
    snapshotId?: string,
  ): Promise<{
    assumptions: AssumptionsV2;
    snapshotMeta: AssumptionsSnapshotMeta;
    simulationAssumptions: SimulationAssumptionsV2;
    snapshotWarnings: SnapshotScenarioExtrasMapping["warnings"];
    snapshotId?: string;
  }>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toSnapshotMeta(
  snapshot: Awaited<ReturnType<typeof loadLatestAssumptionsSnapshot>>,
  snapshotId?: string,
): AssumptionsSnapshotMeta {
  if (!snapshot) {
    return { missing: true };
  }
  return {
    ...(snapshotId ? { id: snapshotId } : {}),
    asOf: snapshot.asOf,
    fetchedAt: snapshot.fetchedAt,
    missing: false,
    warningsCount: snapshot.warnings.length,
    sourcesCount: snapshot.sources.length,
  };
}

function toSimulationOverrides(overrides?: Partial<AssumptionsV2>): Partial<SimulationAssumptionsV2> {
  if (!overrides) return {};
  return {
    ...(isFiniteNumber(overrides.inflationPct) ? { inflation: overrides.inflationPct } : {}),
    ...(isFiniteNumber(overrides.investReturnPct) ? { expectedReturn: overrides.investReturnPct } : {}),
    ...(overrides.debtRates ? { debtRates: overrides.debtRates } : {}),
  };
}

function toScenarioOverrides(overrides?: Partial<AssumptionsV2>): Partial<Pick<AssumptionsV2, "cashReturnPct" | "withdrawalRatePct">> {
  if (!overrides) return {};
  return {
    ...(isFiniteNumber(overrides.cashReturnPct) ? { cashReturnPct: overrides.cashReturnPct } : {}),
    ...(isFiniteNumber(overrides.withdrawalRatePct) ? { withdrawalRatePct: overrides.withdrawalRatePct } : {}),
  };
}

async function resolveSnapshot(snapshotId?: string): Promise<{
  snapshot: Awaited<ReturnType<typeof loadLatestAssumptionsSnapshot>>;
  snapshotId?: string;
}> {
  const requested = typeof snapshotId === "string" ? snapshotId.trim() : "";
  const useLatest = requested.length === 0 || requested.toLowerCase() === "latest";

  if (!useLatest) {
    const found = await loadAssumptionsSnapshotById(requested);
    if (!found) {
      throw {
        code: "SNAPSHOT_NOT_FOUND",
        message: `snapshotId '${requested}' not found. Use 'latest' or select a valid id from /ops/assumptions.`,
      };
    }
    return {
      snapshot: found,
      snapshotId: requested,
    };
  }

  const latest = await loadLatestAssumptionsSnapshot();
  return {
    snapshot: latest,
    snapshotId: latest ? await findAssumptionsSnapshotId(latest) : undefined,
  };
}

export function createFileAssumptionsProvider(): AssumptionsProvider {
  return {
    async getSnapshotRef() {
      const { snapshot, snapshotId } = await resolveSnapshot();
      const meta = toSnapshotMeta(snapshot, snapshotId);
      return {
        ...(meta.id ? { id: meta.id } : {}),
        ...(meta.asOf ? { asOf: meta.asOf } : {}),
        ...(meta.fetchedAt ? { fetchedAt: meta.fetchedAt } : {}),
        missing: meta.missing,
      };
    },

    async getBaseAssumptions(_profile, overrides, snapshotId) {
      const { snapshot, snapshotId: resolvedSnapshotId } = await resolveSnapshot(snapshotId);
      const mappedFromSnapshot = mapSnapshotToAssumptionsV2(snapshot);
      const mappedScenarioExtras = mapSnapshotToScenarioExtrasV2(snapshot);
      const simulationAssumptions = {
        ...DEFAULT_ASSUMPTIONS_V2,
        ...mappedFromSnapshot,
        ...toSimulationOverrides(overrides),
      };

      const assumptions = toScenarioAssumptionsV2(
        simulationAssumptions,
        {
          ...mappedScenarioExtras.extra,
          ...toScenarioOverrides(overrides),
        },
      );

      return {
        assumptions,
        simulationAssumptions,
        snapshotMeta: toSnapshotMeta(snapshot, resolvedSnapshotId),
        snapshotWarnings: mappedScenarioExtras.warnings,
        ...(resolvedSnapshotId ? { snapshotId: resolvedSnapshotId } : {}),
      };
    },
  };
}
