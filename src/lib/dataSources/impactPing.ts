import type { DataSourceUserImpactCard } from "@/lib/dataSources/userImpact";
import type { DataSourcePingSnapshot, PingSourceName } from "@/lib/dataSources/pingState";

export const DATA_SOURCE_PING_SOURCE_BY_ID: Partial<Record<string, PingSourceName>> = {
  EXIM_EXCHANGE: "exim_exchange",
  MOIS_BENEFITS: "mois_benefits",
  REB_SUBSCRIPTION: "reb_subscription",
  FINLIFE: "finlife",
  MOLIT_SALES: "molit_sales",
  MOLIT_RENT: "molit_rent",
};

export type DataSourceImpactPingItem = {
  sourceId: string;
  sourceLabel: string;
  summaryText: string;
  fetchedAt: string;
  statusLabel: "정상" | "주의";
  tone: "ok" | "error";
};

export type DataSourceImpactPingSummary = {
  latestFetchedAt: string | null;
  items: DataSourceImpactPingItem[];
  pendingSourceLabels: string[];
};

export function getImpactPingCapableSourceIds(card: Pick<DataSourceUserImpactCard, "primarySourceIds" | "supportSourceIds">): string[] {
  const merged = [...card.primarySourceIds, ...(card.supportSourceIds ?? [])];
  return [...new Set(merged.filter((sourceId) => Boolean(DATA_SOURCE_PING_SOURCE_BY_ID[sourceId])))];
}

export function buildImpactPingSummary(
  card: Pick<DataSourceUserImpactCard, "primarySourceIds" | "supportSourceIds">,
  sourceLabels: Record<string, string>,
  snapshotsBySourceId: Partial<Record<string, DataSourcePingSnapshot>>,
): DataSourceImpactPingSummary | null {
  const capableSourceIds = getImpactPingCapableSourceIds(card);
  if (capableSourceIds.length === 0) return null;

  const items = capableSourceIds
    .map((sourceId) => {
      const snapshot = snapshotsBySourceId[sourceId];
      if (!snapshot) return null;
      return {
        sourceId,
        sourceLabel: sourceLabels[sourceId] ?? sourceId,
        summaryText: snapshot.summaryText ?? snapshot.text,
        fetchedAt: snapshot.fetchedAt,
        statusLabel: snapshot.statusLabel ?? (snapshot.tone === "ok" ? "정상" : "주의"),
        tone: snapshot.tone,
      } satisfies DataSourceImpactPingItem;
    })
    .filter((item): item is DataSourceImpactPingItem => item !== null)
    .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt));

  const pendingSourceLabels = capableSourceIds
    .filter((sourceId) => !snapshotsBySourceId[sourceId])
    .map((sourceId) => sourceLabels[sourceId] ?? sourceId);

  return {
    latestFetchedAt: items[0]?.fetchedAt ?? null,
    items,
    pendingSourceLabels,
  };
}
