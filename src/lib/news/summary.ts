import {
  type BurstLevel,
  type DigestDay,
  type DigestTopItem,
  type DigestTopTopic,
  type NewsBrief,
  type NewsCluster,
  type NewsRuleSummary,
  type NewsTopByTopic,
  type RisingTopic,
  type ScenarioCard,
  type ScoredNewsItem,
  type TopicTrend,
} from "./types";

type TopicTrendRow = {
  topicId: string;
  topicLabel: string;
  todayCount: number;
  yesterdayCount: number;
  burstZ?: number;
  burstLevel?: BurstLevel;
};

const FORBIDDEN_DIRECTIVE_PATTERN = /(매수|매도|정답|해야|무조건|확실)/g;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeDirectiveText(input: string): string {
  return asString(input).replace(FORBIDDEN_DIRECTIVE_PATTERN, "검토");
}

function sanitizeLines(lines: string[]): string[] {
  return lines.map((row) => sanitizeDirectiveText(row)).filter(Boolean);
}

export function hasForbiddenDirective(input: string): boolean {
  return FORBIDDEN_DIRECTIVE_PATTERN.test(asString(input));
}

function compareCluster(a: NewsCluster, b: NewsCluster): number {
  if (a.clusterScore !== b.clusterScore) return b.clusterScore - a.clusterScore;
  if (a.representativePublishedAt !== b.representativePublishedAt) {
    return b.representativePublishedAt.localeCompare(a.representativePublishedAt);
  }
  return a.clusterId.localeCompare(b.clusterId);
}

function buildTopByTopic(clusters: NewsCluster[], topM: number): NewsTopByTopic[] {
  const grouped = new Map<string, NewsCluster[]>();
  for (const cluster of clusters) {
    const key = `${cluster.topicId}::${cluster.topicLabel}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(cluster);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()]
    .map(([key, rows]) => {
      const [topicId, topicLabel] = key.split("::");
      return {
        topicId,
        topicLabel,
        items: [...rows].sort(compareCluster).slice(0, topM),
      } satisfies NewsTopByTopic;
    })
    .sort((a, b) => {
      const scoreA = a.items[0]?.clusterScore ?? 0;
      const scoreB = b.items[0]?.clusterScore ?? 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.topicLabel.localeCompare(b.topicLabel);
    });
}

export function buildRisingTopics(rows: TopicTrendRow[]): RisingTopic[] {
  return rows
    .map((row) => {
      const todayCount = Math.max(0, Math.round(asNumber(row.todayCount, 0)));
      const yesterdayCount = Math.max(0, Math.round(asNumber(row.yesterdayCount, 0)));
      const delta = todayCount - yesterdayCount;
      const ratio = yesterdayCount <= 0 ? (todayCount > 0 ? 999 : 0) : todayCount / yesterdayCount;
      return {
        topicId: asString(row.topicId),
        topicLabel: asString(row.topicLabel) || asString(row.topicId),
        todayCount,
        yesterdayCount,
        delta,
        ratio: round2(ratio),
      } satisfies RisingTopic;
    })
    .filter((row) => row.topicId)
    .filter((row) => row.delta >= 2 && row.ratio >= 1.5)
    .sort((a, b) => {
      if (a.delta !== b.delta) return b.delta - a.delta;
      if (a.ratio !== b.ratio) return b.ratio - a.ratio;
      return a.topicLabel.localeCompare(b.topicLabel);
    });
}

export function buildRuleSummary(input: {
  topClusters: NewsCluster[];
  risingTopics: RisingTopic[];
  evidenceLinksMin: number;
  evidenceLinksMax: number;
}): NewsRuleSummary {
  const topCluster = input.topClusters[0];
  const topTopic = input.risingTopics[0];

  const observation = topCluster
    ? sanitizeDirectiveText(`${topCluster.topicLabel} 관련 이슈 비중이 높아졌고, 관찰 우선순위가 상승했습니다.`)
    : "유효한 뉴스 데이터가 부족해 관찰 포인트를 도출하지 못했습니다.";

  const evidencePool = input.topClusters
    .map((cluster) => cluster.representativeUrl)
    .filter(Boolean);
  const maxCount = Math.max(input.evidenceLinksMin, input.evidenceLinksMax);
  const minCount = Math.min(input.evidenceLinksMin, input.evidenceLinksMax);
  const evidenceLinks = [...new Set(evidencePool)].slice(0, maxCount);
  const normalizedEvidenceLinks = evidenceLinks.length >= minCount
    ? evidenceLinks
    : evidencePool.slice(0, minCount);

  const watchVariables = sanitizeLines([
    topTopic ? `${topTopic.topicLabel} 기사량(전일 대비)` : "주요 토픽 기사량",
    "정책금리",
    "원/달러 환율",
    "브렌트유",
  ]).slice(0, 4);

  const counterSignals = sanitizeLines([
    "핵심 토픽 기사량 증가세 둔화",
    "주요 지표 변동성 축소",
    "상반 신호 기사 비중 증가",
  ]);

  return {
    observation,
    evidenceLinks: normalizedEvidenceLinks,
    watchVariables,
    counterSignals,
  };
}

export function buildNewsBrief(input: {
  generatedAt: string;
  scoredItems: ScoredNewsItem[];
  clusters: NewsCluster[];
  feeds: number;
  dedupedCount: number;
  topN: number;
  topM: number;
  risingTopics: RisingTopic[];
  evidenceLinksMin: number;
  evidenceLinksMax: number;
}): NewsBrief {
  const topToday = [...input.clusters].sort(compareCluster).slice(0, input.topN);
  const topByTopic = buildTopByTopic(input.clusters, input.topM);
  const summary = buildRuleSummary({
    topClusters: topToday,
    risingTopics: input.risingTopics,
    evidenceLinksMin: input.evidenceLinksMin,
    evidenceLinksMax: input.evidenceLinksMax,
  });

  return {
    generatedAt: input.generatedAt,
    stats: {
      totalItems: input.scoredItems.length,
      totalClusters: input.clusters.length,
      dedupedCount: input.dedupedCount,
      feeds: input.feeds,
    },
    topToday,
    topByTopic,
    risingTopics: input.risingTopics,
    summary,
  };
}

function toDigestTopItem(cluster: NewsCluster): DigestTopItem {
  return {
    topicId: cluster.topicId,
    topicLabel: cluster.topicLabel,
    title: cluster.representativeTitle,
    url: cluster.representativeUrl,
    score: round2(cluster.clusterScore),
    publishedAt: cluster.representativePublishedAt,
    sourceName: cluster.representative.sourceName,
    snippet: cluster.representative.snippet || cluster.representative.description || "",
  };
}

function toDigestTopTopics(trends: TopicTrend[]): DigestTopTopic[] {
  return trends.map((row) => ({
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    count: row.todayCount,
    scoreSum: row.scoreSum,
    burstLevel: row.burstLevel,
  }));
}

export function buildDigestDay(input: {
  generatedAt: string;
  dateKst: string;
  brief: NewsBrief;
  trends: TopicTrend[];
  scenarioCards?: ScenarioCard[];
  topItemsLimit?: number;
  topTopicsLimit?: number;
}): DigestDay {
  const topItemsLimit = Math.max(1, Math.min(20, Math.round(asNumber(input.topItemsLimit, 10))));
  const topTopicsLimit = Math.max(1, Math.min(20, Math.round(asNumber(input.topTopicsLimit, 10))));

  const topItems = input.brief.topToday.slice(0, topItemsLimit).map(toDigestTopItem);
  const topTopics = toDigestTopTopics(input.trends.slice(0, topTopicsLimit));
  const burstTopics = toDigestTopTopics(input.trends.filter((row) => row.burstLevel !== "하").slice(0, topTopicsLimit));
  const watchlist = [...new Set(input.brief.summary.watchVariables)].slice(0, 8);

  return {
    date: input.dateKst,
    generatedAt: input.generatedAt,
    topItems,
    topTopics,
    burstTopics,
    watchlist,
    scenarioCards: input.scenarioCards ?? [],
    summary: input.brief.summary,
  };
}

export function toNewsBriefMarkdown(brief: NewsBrief): string {
  const lines: string[] = [];
  lines.push("# News Daily Brief");
  lines.push("");
  lines.push("## 요약");
  lines.push(`- Generated at: ${brief.generatedAt}`);
  lines.push(`- Stats: items=${brief.stats.totalItems}, clusters=${brief.stats.totalClusters}, deduped=${brief.stats.dedupedCount}, feeds=${brief.stats.feeds}`);
  lines.push(`- Observation: ${brief.summary.observation}`);
  lines.push("");
  lines.push("## 근거 링크 (2~5)");
  if (brief.summary.evidenceLinks.length < 1) {
    lines.push("- 없음");
  } else {
    for (const link of brief.summary.evidenceLinks.slice(0, 5)) {
      lines.push(`- ${link}`);
    }
  }
  lines.push("");
  lines.push("## 체크 변수");
  for (const variable of brief.summary.watchVariables) {
    lines.push(`- ${variable}`);
  }
  lines.push("");
  lines.push("## 반대 시그널");
  for (const signal of brief.summary.counterSignals) {
    lines.push(`- ${signal}`);
  }
  lines.push("");
  lines.push("## 오늘의 Top N");
  if (brief.topToday.length < 1) {
    lines.push("- 없음");
  } else {
    for (const cluster of brief.topToday) {
      lines.push(`- [${round2(cluster.clusterScore)}] ${cluster.topicLabel} | ${cluster.representativeTitle} | ${cluster.representativeUrl}`);
    }
  }
  lines.push("");
  lines.push("## 토픽별 Top M");
  if (brief.topByTopic.length < 1) {
    lines.push("- 없음");
  } else {
    for (const topic of brief.topByTopic) {
      lines.push(`- ${topic.topicLabel}`);
      for (const cluster of topic.items) {
        lines.push(`  - [${round2(cluster.clusterScore)}] ${cluster.representativeTitle} | ${cluster.representativeUrl}`);
      }
    }
  }
  lines.push("");
  lines.push("## 증가 토픽");
  if (brief.risingTopics.length < 1) {
    lines.push("- 없음");
  } else {
    for (const topic of brief.risingTopics) {
      lines.push(`- ${topic.topicLabel}: today=${topic.todayCount}, yesterday=${topic.yesterdayCount}, delta=${topic.delta}, ratio=${topic.ratio}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function toDigestDayMarkdown(digest: DigestDay): string {
  const lines: string[] = [];
  lines.push("# News Digest Day");
  lines.push("");
  lines.push(`- Date(KST): ${digest.date}`);
  lines.push(`- Generated at: ${digest.generatedAt}`);
  lines.push(`- Observation: ${digest.summary.observation}`);
  lines.push("");
  lines.push("## 근거 링크");
  if (digest.summary.evidenceLinks.length < 1) {
    lines.push("- 없음");
  } else {
    for (const link of digest.summary.evidenceLinks.slice(0, 5)) {
      lines.push(`- ${link}`);
    }
  }
  lines.push("");
  lines.push("## 오늘 주요 토픽");
  if (digest.topTopics.length < 1) {
    lines.push("- 없음");
  } else {
    for (const row of digest.topTopics) {
      lines.push(`- ${row.topicLabel}: count=${row.count}, scoreSum=${round2(row.scoreSum)}, burst=${row.burstLevel}`);
    }
  }
  lines.push("");
  lines.push("## 급증 토픽");
  if (digest.burstTopics.length < 1) {
    lines.push("- 없음");
  } else {
    for (const row of digest.burstTopics) {
      lines.push(`- ${row.topicLabel}: burst=${row.burstLevel}`);
    }
  }
  lines.push("");
  lines.push("## 체크 변수");
  for (const row of digest.watchlist) {
    lines.push(`- ${row}`);
  }
  lines.push("");
  lines.push("## Top Items");
  if (digest.topItems.length < 1) {
    lines.push("- 없음");
  } else {
    for (const item of digest.topItems) {
      lines.push(`- [${item.score}] ${item.topicLabel} | ${item.title} | ${item.url}`);
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
