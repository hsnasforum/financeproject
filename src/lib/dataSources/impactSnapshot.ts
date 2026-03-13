import { loadLatestAssumptionsSnapshot } from "@/lib/planning/assumptions/storage";
import { getCorpIndexStatus, type CorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";
import {
  buildDataSourceImpactHealthSummaryMap,
  buildDataSourceImpactReadOnlyHealth,
  type DataSourceImpactHealthSummary,
  type DataSourceImpactReadOnlyHealth,
} from "./impactHealth";

type ImpactCardId = "dart" | "planning";

export type DataSourceImpactSnapshot = {
  openDartConfigured: boolean;
  openDartIndexStatus: CorpIndexStatus;
  planningError: string;
  planningSnapshot: Awaited<ReturnType<typeof loadLatestAssumptionsSnapshot>>;
  impactHealthByCardId: Partial<Record<ImpactCardId, DataSourceImpactHealthSummary>>;
  impactReadOnlyByCardId: Partial<Record<ImpactCardId, DataSourceImpactReadOnlyHealth>>;
};

export type DataSourceImpactBundleSummary = {
  sources: {
    opendart: {
      configured: boolean;
      indexExists: boolean;
      generatedAt: string | null;
      count: number | null;
    };
    planning: {
      snapshotState: "available" | "missing" | "read_failed";
      asOf: string | null;
      fetchedAt: string | null;
      warningsCount: number | null;
    };
  };
  cards: {
    healthSummaryByCardId: Partial<Record<ImpactCardId, DataSourceImpactHealthSummary>>;
    readOnlyHealthByCardId: Partial<Record<ImpactCardId, DataSourceImpactReadOnlyHealth>>;
  };
};

export async function loadDataSourceImpactSnapshot(): Promise<DataSourceImpactSnapshot> {
  const openDartConfigured = Boolean((process.env.OPENDART_API_KEY ?? "").trim());
  const openDartIndexStatus = getCorpIndexStatus();
  let planningError = "";
  const planningSnapshot = await loadLatestAssumptionsSnapshot().catch((error) => {
    planningError = error instanceof Error ? error.message : "latest snapshot load failed";
    return null;
  });

  return {
    openDartConfigured,
    openDartIndexStatus,
    planningError,
    planningSnapshot,
    impactHealthByCardId: buildDataSourceImpactHealthSummaryMap({
      openDartConfigured,
      dartStatus: openDartIndexStatus,
      planningSnapshot,
      ...(planningError ? { planningError } : {}),
    }),
    impactReadOnlyByCardId: buildDataSourceImpactReadOnlyHealth({
      openDartConfigured,
      openDartIndexStatus,
      planningSnapshot,
      ...(planningError ? { planningError } : {}),
    }),
  };
}

export function buildDataSourceImpactBundleSummary(
  snapshot: DataSourceImpactSnapshot,
): DataSourceImpactBundleSummary {
  return {
    sources: {
      opendart: {
        configured: snapshot.openDartConfigured,
        indexExists: snapshot.openDartIndexStatus.exists,
        generatedAt: snapshot.openDartIndexStatus.meta?.generatedAt ?? null,
        count: typeof snapshot.openDartIndexStatus.meta?.count === "number" ? snapshot.openDartIndexStatus.meta.count : null,
      },
      planning: {
        snapshotState: snapshot.planningSnapshot
          ? "available"
          : snapshot.planningError
            ? "read_failed"
            : "missing",
        asOf: snapshot.planningSnapshot?.asOf ?? null,
        fetchedAt: snapshot.planningSnapshot?.fetchedAt ?? null,
        warningsCount: snapshot.planningSnapshot ? snapshot.planningSnapshot.warnings.length : null,
      },
    },
    cards: {
      healthSummaryByCardId: snapshot.impactHealthByCardId,
      readOnlyHealthByCardId: snapshot.impactReadOnlyByCardId,
    },
  };
}
