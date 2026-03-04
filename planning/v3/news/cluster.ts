import { NewsClusterSchema, type NewsCluster, type ScoredNewsItem } from "./contracts";

type ClusterOptions = {
  similarityThreshold?: number;
};

type ClusterBucket = {
  clusterId: string;
  representative: ScoredNewsItem;
  representativeTokens: Set<string>;
  items: ScoredNewsItem[];
};

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string): Set<string> {
  const tokens = normalizeTitle(title).split(" ").filter((token) => token.length >= 2);
  return new Set(tokens);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size < 1 || right.size < 1) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function compareScored(a: ScoredNewsItem, b: ScoredNewsItem): number {
  if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
  const aPub = a.publishedAt ?? "";
  const bPub = b.publishedAt ?? "";
  if (aPub !== bPub) return bPub.localeCompare(aPub);
  return a.id.localeCompare(b.id);
}

export function clusterItems(items: ScoredNewsItem[], options: ClusterOptions = {}): NewsCluster[] {
  const threshold = Number.isFinite(options.similarityThreshold)
    ? Math.min(1, Math.max(0, Number(options.similarityThreshold)))
    : 0.55;

  const sorted = [...items].sort(compareScored);
  const buckets: ClusterBucket[] = [];

  for (const item of sorted) {
    const tokens = titleTokens(item.title);
    let matchedBucket: ClusterBucket | null = null;

    for (const bucket of buckets) {
      const similarity = jaccard(tokens, bucket.representativeTokens);
      if (similarity >= threshold) {
        matchedBucket = bucket;
        break;
      }
    }

    if (!matchedBucket) {
      buckets.push({
        clusterId: `cluster-${item.id.slice(0, 12)}`,
        representative: item,
        representativeTokens: tokens,
        items: [item],
      });
      continue;
    }

    matchedBucket.items.push(item);
    if (compareScored(item, matchedBucket.representative) < 0) {
      matchedBucket.representative = item;
      matchedBucket.representativeTokens = tokens;
    }
  }

  return buckets
    .map((bucket) => NewsClusterSchema.parse({
      clusterId: bucket.clusterId,
      representative: bucket.representative,
      items: bucket.items.sort(compareScored),
    }))
    .sort((a, b) => compareScored(a.representative, b.representative));
}
