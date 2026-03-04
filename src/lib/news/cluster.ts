import { type NewsCluster, type ScoredNewsItem } from "./types";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tokenizeTitle(title: string): string[] {
  const normalized = asString(title)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  return [...new Set(normalized.split(" ").filter((token) => token.length >= 2 || /^\d+$/.test(token)))].sort((a, b) => a.localeCompare(b));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let intersection = 0;
  for (const token of sa) {
    if (sb.has(token)) intersection += 1;
  }
  const union = sa.size + sb.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function hoursBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / (1000 * 60 * 60);
}

function compareRepresentative(a: ScoredNewsItem, b: ScoredNewsItem): number {
  if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
  if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
  return a.canonicalUrl.localeCompare(b.canonicalUrl);
}

function clusterSort(a: NewsCluster, b: NewsCluster): number {
  if (a.clusterScore !== b.clusterScore) return b.clusterScore - a.clusterScore;
  if (a.representativePublishedAt !== b.representativePublishedAt) {
    return b.representativePublishedAt.localeCompare(a.representativePublishedAt);
  }
  return a.clusterId.localeCompare(b.clusterId);
}

function calcClusterScore(representative: ScoredNewsItem, count: number): number {
  const bonus = Math.log2(Math.max(1, count)) * 2;
  return Math.round((representative.totalScore + bonus) * 100) / 100;
}

export function clusterNewsItems(
  items: ScoredNewsItem[],
  options?: {
    windowHours?: number;
    minJaccard?: number;
  },
): NewsCluster[] {
  const windowHours = Math.max(1, Math.min(240, Math.round(options?.windowHours ?? 36)));
  const minJaccard = Math.max(0, Math.min(1, Number(options?.minJaccard ?? 0.55)));

  const sorted = [...items].sort(compareRepresentative);
  const clusters: NewsCluster[] = [];

  for (const item of sorted) {
    let selected: NewsCluster | null = null;

    for (const cluster of clusters) {
      if (cluster.topicId !== item.primaryTopicId) continue;
      const diff = hoursBetween(cluster.representativePublishedAt, item.publishedAt);
      if (diff > windowHours) continue;

      if (cluster.representative.dedupeKey === item.dedupeKey) {
        selected = cluster;
        break;
      }

      const sim = jaccard(tokenizeTitle(cluster.representativeTitle), tokenizeTitle(item.title));
      if (sim >= minJaccard) {
        selected = cluster;
        break;
      }
    }

    if (!selected) {
      clusters.push({
        clusterId: `${item.primaryTopicId}:${item.id.slice(0, 12)}`,
        topicId: item.primaryTopicId,
        topicLabel: item.primaryTopicLabel,
        count: 1,
        representative: item,
        representativeUrl: item.url,
        representativeTitle: item.title,
        representativePublishedAt: item.publishedAt,
        clusterScore: calcClusterScore(item, 1),
        items: [item],
      });
      continue;
    }

    selected.items = [...selected.items, item].sort(compareRepresentative);
    selected.representative = selected.items[0] ?? selected.representative;
    selected.representativeUrl = selected.representative.url;
    selected.representativeTitle = selected.representative.title;
    selected.representativePublishedAt = selected.representative.publishedAt;
    selected.count = selected.items.length;
    selected.clusterScore = calcClusterScore(selected.representative, selected.count);
  }

  return clusters.sort(clusterSort);
}
