export type DisclosureClusterItem = {
  corpCode?: string;
  corpName?: string;
  reportName?: string;
  normalizedTitle?: string;
  tokens?: string[];
  receiptNo?: string;
  receiptDate?: string;
  classification?: {
    categoryId?: string;
    categoryLabel?: string;
    score?: number;
    level?: "high" | "mid" | "low";
  };
  [key: string]: unknown;
};

export type DisclosureClusterOptions = {
  windowDays: number;
  minTokenOverlap: number;
  maxClusterSize: number;
};

export type DisclosureCluster = {
  clusterId: string;
  corpCode: string;
  corpName?: string;
  count: number;
  startDate?: string;
  endDate?: string;
  representative: DisclosureClusterItem;
  representativeTitle: string;
  representativeScore: number;
  clusterScore: number;
  representativeLevel: "high" | "mid" | "low";
  categoryId?: string;
  categoryLabel?: string;
  items: DisclosureClusterItem[];
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toScore(item: DisclosureClusterItem): number {
  const raw = Number(item.classification?.score ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return raw;
}

function parseDate(value?: string): Date | null {
  const text = asString(value);
  if (!text) return null;
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month, day));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateDiffDays(a?: string, b?: string): number | null {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
}

function tokensOf(item: DisclosureClusterItem): string[] {
  if (!Array.isArray(item.tokens)) return [];
  return [...new Set(item.tokens.map(asString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
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

function compareItem(a: DisclosureClusterItem, b: DisclosureClusterItem): number {
  const scoreDiff = toScore(b) - toScore(a);
  if (scoreDiff !== 0) return scoreDiff;
  const dateA = asString(a.receiptDate);
  const dateB = asString(b.receiptDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const receiptA = asString(a.receiptNo);
  const receiptB = asString(b.receiptNo);
  if (receiptA !== receiptB) return receiptA.localeCompare(receiptB);
  return asString(a.reportName).localeCompare(asString(b.reportName));
}

function levelWeight(level: "high" | "mid" | "low"): number {
  if (level === "high") return 3;
  if (level === "mid") return 2;
  return 1;
}

function hasRepresentativePenalty(item: DisclosureClusterItem): boolean {
  const title = asString(item.normalizedTitle || item.reportName);
  return /정정|첨부|공시서류제출|연결/.test(title);
}

function compareRepresentative(a: DisclosureClusterItem, b: DisclosureClusterItem): number {
  const levelDiff = levelWeight(levelOf(b)) - levelWeight(levelOf(a));
  if (levelDiff !== 0) return levelDiff;

  const penaltyA = hasRepresentativePenalty(a) ? 1 : 0;
  const penaltyB = hasRepresentativePenalty(b) ? 1 : 0;
  if (penaltyA !== penaltyB) return penaltyA - penaltyB;

  const scoreDiff = toScore(b) - toScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  const dateA = asString(a.receiptDate);
  const dateB = asString(b.receiptDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);

  const receiptA = asString(a.receiptNo);
  const receiptB = asString(b.receiptNo);
  if (receiptA !== receiptB) return receiptA.localeCompare(receiptB);

  return asString(a.reportName).localeCompare(asString(b.reportName));
}

function pickRepresentative(items: DisclosureClusterItem[]): DisclosureClusterItem {
  return [...items].sort(compareRepresentative)[0] ?? items[0]!;
}

function levelOf(item: DisclosureClusterItem): "high" | "mid" | "low" {
  const level = asString(item.classification?.level).toLowerCase();
  if (level === "high" || level === "mid" || level === "low") return level;
  return "low";
}

function dateRange(items: DisclosureClusterItem[]): { startDate?: string; endDate?: string } {
  const dates = items
    .map((item) => asString(item.receiptDate))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return {
    startDate: dates[0] || undefined,
    endDate: dates[dates.length - 1] || undefined,
  };
}

function sortedItems(items: DisclosureClusterItem[]): DisclosureClusterItem[] {
  return [...items].sort(compareItem);
}

function toClusterId(corpCode: string, representative: DisclosureClusterItem): string {
  const receiptNo = asString(representative.receiptNo);
  if (receiptNo) return `${corpCode}:${receiptNo}`;
  const title = asString(representative.normalizedTitle || representative.reportName).slice(0, 40).replace(/\s+/g, "_");
  return `${corpCode}:${title || "cluster"}`;
}

function recencyBonus(receiptDate?: string, nowDate: Date = new Date()): number {
  const target = parseDate(receiptDate);
  if (!target) return 0;
  const now = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const then = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
  if (diffDays <= 1) return 6;
  if (diffDays <= 7) return 4;
  if (diffDays <= 30) return 2;
  return 0;
}

function computeClusterScore(items: DisclosureClusterItem[], representative: DisclosureClusterItem): number {
  const safeItems = items.length > 0 ? items : [representative];
  const maxItemScore = safeItems.reduce((max, item) => Math.max(max, toScore(item)), 0);
  const itemCountBonus = Math.log2(Math.max(1, safeItems.length)) * 3;
  const latestDate = safeItems
    .map((item) => asString(item.receiptDate))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || representative.receiptDate;
  return Math.round((maxItemScore + itemCountBonus + recencyBonus(latestDate)) * 100) / 100;
}

function buildCluster(corpCode: string, items: DisclosureClusterItem[]): DisclosureCluster {
  const sorted = sortedItems(items);
  const representative = pickRepresentative(sorted);
  const range = dateRange(sorted);
  const clusterScore = computeClusterScore(sorted, representative);
  return {
    clusterId: toClusterId(corpCode, representative),
    corpCode,
    corpName: asString(representative.corpName) || undefined,
    count: sorted.length,
    startDate: range.startDate,
    endDate: range.endDate,
    representative,
    representativeTitle: asString(representative.normalizedTitle || representative.reportName) || "(제목 없음)",
    representativeScore: toScore(representative),
    clusterScore,
    representativeLevel: levelOf(representative),
    categoryId: asString(representative.classification?.categoryId) || undefined,
    categoryLabel: asString(representative.classification?.categoryLabel) || undefined,
    items: sorted,
  };
}

function compareCluster(a: DisclosureCluster, b: DisclosureCluster): number {
  if (a.clusterScore !== b.clusterScore) return b.clusterScore - a.clusterScore;
  const dateA = asString(a.endDate);
  const dateB = asString(b.endDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  if (a.representativeScore !== b.representativeScore) return b.representativeScore - a.representativeScore;
  if (a.count !== b.count) return b.count - a.count;
  return a.clusterId.localeCompare(b.clusterId);
}

function normalizeOptions(input: DisclosureClusterOptions): DisclosureClusterOptions {
  return {
    windowDays: Math.max(1, Math.min(120, Math.round(Number(input.windowDays) || 10))),
    minTokenOverlap: Math.max(0, Math.min(1, Number(input.minTokenOverlap) || 0.34)),
    maxClusterSize: Math.max(1, Math.min(100, Math.round(Number(input.maxClusterSize) || 8))),
  };
}

function shouldJoinCluster(
  item: DisclosureClusterItem,
  clusterItems: DisclosureClusterItem[],
  options: DisclosureClusterOptions,
): { join: boolean; similarity: number } {
  const representative = pickRepresentative(clusterItems);
  const similarity = jaccard(tokensOf(item), tokensOf(representative));
  if (similarity < options.minTokenOverlap) {
    return { join: false, similarity };
  }
  const dayGap = dateDiffDays(item.receiptDate, representative.receiptDate);
  if (dayGap !== null && dayGap > options.windowDays) {
    return { join: false, similarity };
  }
  return { join: true, similarity };
}

export function clusterByCorp(
  items: DisclosureClusterItem[],
  optionsInput: DisclosureClusterOptions,
): DisclosureCluster[] {
  const options = normalizeOptions(optionsInput);
  const corpGroups = new Map<string, DisclosureClusterItem[]>();
  for (const item of items) {
    const corpCode = asString(item.corpCode);
    if (!corpCode) continue;
    const bucket = corpGroups.get(corpCode) ?? [];
    bucket.push(item);
    corpGroups.set(corpCode, bucket);
  }

  const clusters: DisclosureCluster[] = [];
  const corpCodes = [...corpGroups.keys()].sort((a, b) => a.localeCompare(b));
  for (const corpCode of corpCodes) {
    const rows = sortedItems(corpGroups.get(corpCode) ?? []);
    const categoryGroups = new Map<string, DisclosureClusterItem[]>();
    for (const item of rows) {
      const categoryKey = asString(item.classification?.categoryId) || "unknown";
      const bucket = categoryGroups.get(categoryKey) ?? [];
      bucket.push(item);
      categoryGroups.set(categoryKey, bucket);
    }

    const corpBuilt: DisclosureCluster[] = [];
    const categoryKeys = [...categoryGroups.keys()].sort((a, b) => a.localeCompare(b));
    for (const categoryKey of categoryKeys) {
      const categoryRows = sortedItems(categoryGroups.get(categoryKey) ?? []);
      const corpClusters: DisclosureClusterItem[][] = [];

      for (const item of categoryRows) {
        let selectedIndex = -1;
        let selectedSimilarity = -1;

        for (let index = 0; index < corpClusters.length; index += 1) {
          const candidate = corpClusters[index]!;
          if (candidate.length >= options.maxClusterSize) continue;
          const verdict = shouldJoinCluster(item, candidate, options);
          if (!verdict.join) continue;

          if (verdict.similarity > selectedSimilarity) {
            selectedSimilarity = verdict.similarity;
            selectedIndex = index;
            continue;
          }

          if (verdict.similarity === selectedSimilarity && selectedIndex >= 0) {
            const selectedRepresentative = pickRepresentative(corpClusters[selectedIndex]!);
            const currentRepresentative = pickRepresentative(candidate);
            const tieBreak = compareRepresentative(currentRepresentative, selectedRepresentative);
            if (tieBreak < 0) {
              selectedIndex = index;
            }
          }
        }

        if (selectedIndex >= 0) {
          corpClusters[selectedIndex] = [...corpClusters[selectedIndex]!, item];
        } else {
          corpClusters.push([item]);
        }
      }

      const built = corpClusters.map((clusterItems) => buildCluster(corpCode, clusterItems)).sort(compareCluster);
      corpBuilt.push(...built);
    }
    clusters.push(...corpBuilt.sort(compareCluster));
  }

  return clusters.sort(compareCluster);
}
