type Level = "high" | "mid" | "low";

type DigestClusterItem = {
  receiptNo?: string;
  rcept_no?: string;
  receiptDate?: string;
  rcept_dt?: string;
  reportName?: string;
  normalizedTitle?: string;
  tokens?: string[];
  classification?: {
    score?: number;
    level?: string;
  };
  [key: string]: unknown;
};

type DigestClusterLike = {
  clusterId?: string;
  corpCode?: string;
  corpName?: string;
  categoryId?: string;
  categoryLabel?: string;
  representativeTitle?: string;
  representativeLevel?: string;
  representativeScore?: number;
  clusterScore?: number;
  count?: number;
  endDate?: string;
  representative?: DigestClusterItem;
  items?: DigestClusterItem[];
  [key: string]: unknown;
};

type DigestCompanyLike = {
  corpCode?: string;
  corpName?: string;
  clusters?: DigestClusterLike[];
  [key: string]: unknown;
};

export type DisclosureDigestLike = {
  companies?: DigestCompanyLike[];
  [key: string]: unknown;
};

export type DigestClusterSnapshot = {
  clusterKey: string;
  clusterId?: string;
  corpCode: string;
  corpName?: string;
  categoryId?: string;
  categoryLabel?: string;
  representativeTitle: string;
  representativeLevel: Level;
  representativeScore: number;
  clusterScore: number;
  maxScore: number;
  itemsCount: number;
  representativeReceiptNo?: string;
  endDate?: string;
  viewerUrl?: string;
};

type DigestDiffChanges = {
  itemsCountIncreased: boolean;
  representativeChanged: boolean;
  maxScoreIncreased: boolean;
  clusterScoreIncreased: boolean;
};

export type DigestDiffEvent = {
  clusterKey: string;
  previous: DigestClusterSnapshot | null;
  current: DigestClusterSnapshot;
  changes: DigestDiffChanges;
};

export type DisclosureDigestDiff = {
  newClusters: DigestDiffEvent[];
  updatedClusters: DigestDiffEvent[];
  highlightsHighMid: DigestDiffEvent[];
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function asLevel(value: unknown): Level {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized === "mid" || normalized === "low") {
    return normalized;
  }
  return "low";
}

function levelWeight(level: Level): number {
  if (level === "high") return 3;
  if (level === "mid") return 2;
  return 1;
}

function tokenize(text: string): string[] {
  const normalized = asString(text).toLowerCase();
  if (!normalized) return [];
  const tokens = normalized
    .replace(/[^0-9a-z가-힣]+/gi, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || /^\d+$/.test(token));
  return [...new Set(tokens)].sort((a, b) => a.localeCompare(b));
}

function receiptNoOf(item: DigestClusterItem | null | undefined): string {
  if (!item) return "";
  return asString(item.receiptNo || item.rcept_no);
}

function buildViewerUrl(receiptNo?: string): string | undefined {
  const safeReceiptNo = asString(receiptNo);
  if (!safeReceiptNo) return undefined;
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${safeReceiptNo}`;
}

function maxScoreOf(items: DigestClusterItem[], representativeScore: number): number {
  const maxByItems = items.reduce((max, item) => {
    return Math.max(max, asNumber(item.classification?.score, 0));
  }, 0);
  return Math.max(maxByItems, representativeScore);
}

function keySignature(cluster: DigestClusterLike, representativeTitle: string, items: DigestClusterItem[]): string {
  const tokenBucket: string[] = [];
  for (const item of items) {
    if (Array.isArray(item.tokens)) {
      for (const token of item.tokens) {
        const normalized = asString(token).toLowerCase();
        if (normalized) tokenBucket.push(normalized);
      }
      continue;
    }
    tokenBucket.push(...tokenize(asString(item.normalizedTitle || item.reportName)));
  }
  if (tokenBucket.length === 0 && cluster.representative) {
    if (Array.isArray(cluster.representative.tokens)) {
      for (const token of cluster.representative.tokens) {
        const normalized = asString(token).toLowerCase();
        if (normalized) tokenBucket.push(normalized);
      }
    } else {
      tokenBucket.push(...tokenize(asString(cluster.representative.normalizedTitle || cluster.representative.reportName)));
    }
  }
  if (tokenBucket.length === 0) {
    tokenBucket.push(...tokenize(representativeTitle));
  }
  const normalizedTokens = [...new Set(tokenBucket.map((token) => token.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8);
  if (normalizedTokens.length > 0) return normalizedTokens.join("|");
  return asString(cluster.clusterId) || "cluster";
}

export function extractClusterSnapshots(digest: DisclosureDigestLike | null | undefined): DigestClusterSnapshot[] {
  const companies = Array.isArray(digest?.companies) ? digest.companies : [];
  const snapshots: DigestClusterSnapshot[] = [];

  for (const company of companies) {
    const clusters = Array.isArray(company?.clusters) ? company.clusters : [];
    for (const cluster of clusters) {
      const corpCode = asString(cluster.corpCode || company.corpCode);
      if (!corpCode) continue;
      const corpName = asString(cluster.corpName || company.corpName) || undefined;
      const categoryId = asString(cluster.categoryId) || "unknown";
      const categoryLabel = asString(cluster.categoryLabel) || undefined;
      const representative = cluster.representative;
      const items = Array.isArray(cluster.items) ? cluster.items : [];
      const representativeTitle =
        asString(cluster.representativeTitle || representative?.normalizedTitle || representative?.reportName) || "(제목 없음)";
      const representativeLevel = asLevel(cluster.representativeLevel || representative?.classification?.level);
      const representativeScore = asNumber(cluster.representativeScore ?? representative?.classification?.score, 0);
      const clusterScore = asNumber(cluster.clusterScore, representativeScore);
      const itemsCount = Math.max(0, Math.round(asNumber(cluster.count, items.length)));
      const representativeReceiptNo =
        receiptNoOf(representative) ||
        receiptNoOf(items[0]) ||
        "";
      const signature = keySignature(cluster, representativeTitle, items);
      const clusterKey = `${corpCode}::${categoryId}::${signature}`;

      snapshots.push({
        clusterKey,
        clusterId: asString(cluster.clusterId) || undefined,
        corpCode,
        corpName,
        categoryId,
        categoryLabel,
        representativeTitle,
        representativeLevel,
        representativeScore,
        clusterScore,
        maxScore: maxScoreOf(items, representativeScore),
        itemsCount,
        representativeReceiptNo: representativeReceiptNo || undefined,
        endDate: asString(cluster.endDate) || undefined,
        viewerUrl: buildViewerUrl(representativeReceiptNo),
      });
    }
  }

  return snapshots;
}

function compareSnapshot(a: DigestClusterSnapshot, b: DigestClusterSnapshot): number {
  if (a.clusterScore !== b.clusterScore) return b.clusterScore - a.clusterScore;
  const dateA = asString(a.endDate);
  const dateB = asString(b.endDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  if (a.representativeScore !== b.representativeScore) return b.representativeScore - a.representativeScore;
  return a.clusterKey.localeCompare(b.clusterKey);
}

function compareEvent(a: DigestDiffEvent, b: DigestDiffEvent): number {
  return compareSnapshot(a.current, b.current);
}

function toUpdatedChanges(previous: DigestClusterSnapshot, current: DigestClusterSnapshot): DigestDiffChanges {
  const representativeChanged =
    asString(previous.representativeReceiptNo) !== asString(current.representativeReceiptNo) ||
    asString(previous.representativeTitle) !== asString(current.representativeTitle);
  return {
    itemsCountIncreased: current.itemsCount > previous.itemsCount,
    representativeChanged,
    maxScoreIncreased: current.maxScore > previous.maxScore,
    clusterScoreIncreased: current.clusterScore > previous.clusterScore,
  };
}

export function diffDigest(
  prevDigest: DisclosureDigestLike | null | undefined,
  currDigest: DisclosureDigestLike | null | undefined,
): DisclosureDigestDiff {
  const prevSnapshots = extractClusterSnapshots(prevDigest);
  const currSnapshots = extractClusterSnapshots(currDigest);

  const prevMap = new Map<string, DigestClusterSnapshot>();
  for (const snapshot of prevSnapshots) {
    prevMap.set(snapshot.clusterKey, snapshot);
  }

  const newClusters: DigestDiffEvent[] = [];
  const updatedClusters: DigestDiffEvent[] = [];

  for (const current of currSnapshots) {
    const previous = prevMap.get(current.clusterKey);
    if (!previous) {
      newClusters.push({
        clusterKey: current.clusterKey,
        previous: null,
        current,
        changes: {
          itemsCountIncreased: true,
          representativeChanged: false,
          maxScoreIncreased: true,
          clusterScoreIncreased: true,
        },
      });
      continue;
    }

    const changes = toUpdatedChanges(previous, current);
    if (changes.itemsCountIncreased || changes.representativeChanged || changes.maxScoreIncreased || changes.clusterScoreIncreased) {
      updatedClusters.push({
        clusterKey: current.clusterKey,
        previous,
        current,
        changes,
      });
    }
  }

  const highlightsHighMid = [...newClusters, ...updatedClusters]
    .filter((event) => event.current.representativeLevel === "high" || event.current.representativeLevel === "mid")
    .sort((a, b) => {
      const levelDiff = levelWeight(b.current.representativeLevel) - levelWeight(a.current.representativeLevel);
      if (levelDiff !== 0) return levelDiff;
      return compareEvent(a, b);
    });

  return {
    newClusters: newClusters.sort(compareEvent),
    updatedClusters: updatedClusters.sort(compareEvent),
    highlightsHighMid,
  };
}

export function hasNewHighAlerts(diff: DisclosureDigestDiff): boolean {
  return diff.newClusters.some((event) => event.current.representativeLevel === "high");
}
