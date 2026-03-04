export type NewsFeedConfig = {
  id: string;
  name: string;
  url: string;
  homepageUrl?: string;
  country?: string;
  language?: string;
  weight: number;
  enabled: boolean;
  takeLatest?: number;
};

export type NewsFeedConfigFile = {
  version: number;
  generatedAt?: string;
  defaultTakeLatest?: number;
  feeds: NewsFeedConfig[];
};

export type NewsTopicDefinition = {
  id: string;
  label: string;
  keywords: string[];
  entities: string[];
  watchVariables?: string[];
  counterSignals?: string[];
};

export type NewsTopicFallback = {
  id: string;
  label: string;
  watchVariables?: string[];
  counterSignals?: string[];
};

export type NewsTopicDictionary = {
  version: number;
  generatedAt?: string;
  topics: NewsTopicDefinition[];
  fallbackTopic: NewsTopicFallback;
  stopwords?: string[];
};

export type RecencyBucket = {
  maxHours: number;
  score: number;
};

export type NewsScoringConfig = {
  version: number;
  generatedAt?: string;
  weights: {
    sourceMax: number;
    keywordMax: number;
    recencyMax: number;
    focusMax: number;
  };
  recencyBuckets: RecencyBucket[];
  defaults: {
    topN: number;
    topM: number;
    clusterWindowHours: number;
    clusterMinJaccard: number;
    retentionDays: number;
    evidenceLinksMin: number;
    evidenceLinksMax: number;
    burstWindowDays?: number;
    burstHistoryMinDays?: number;
  };
  relativeScore?: {
    recencyBoost?: {
      within24h?: number;
      within48h?: number;
      within7d?: number;
      otherwise?: number;
    };
    keywordBoostCap?: number;
    topicBurstBoost?: {
      high?: number;
      mid?: number;
      low?: number;
    };
    duplicatePenalty?: number;
    diversityPenaltySlope?: number;
    diversityPenaltyStart?: number;
  };
  burst?: {
    highThreshold?: number;
    midThreshold?: number;
  };
};

export type RawFeedEntry = {
  feedItemId?: string;
  title: string;
  snippet: string;
  // Backward-compatible alias during snippet migration.
  description?: string;
  url: string;
  publishedAt: string | null;
};

export type NewsItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  feedItemId?: string;
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  // Backward-compatible alias during snippet migration.
  description?: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
  dedupeKey: string;
};

export type NewsTopicTag = {
  topicId: string;
  topicLabel: string;
  score: number;
  keywordMatches: string[];
  entityMatches: string[];
  tfidfBoost: number;
};

export type TaggedNewsItem = NewsItem & {
  tokens: string[];
  tags: NewsTopicTag[];
  primaryTopicId: string;
  primaryTopicLabel: string;
  primaryTopicScore: number;
};

export type NewsScoreParts = {
  source: number;
  recency: number;
  keyword: number;
  burst: number;
  diversityPenalty: number;
  duplicatePenalty: number;
};

export type ScoredNewsItem = TaggedNewsItem & {
  sourceWeight: number;
  sourceScore: number;
  keywordScore: number;
  recencyScore: number;
  focusScore: number;
  totalScore: number;
  relativeScore: number;
  scoreParts: NewsScoreParts;
};

export type NewsCluster = {
  clusterId: string;
  topicId: string;
  topicLabel: string;
  count: number;
  representative: ScoredNewsItem;
  representativeUrl: string;
  representativeTitle: string;
  representativePublishedAt: string;
  clusterScore: number;
  items: ScoredNewsItem[];
};

export type NewsTopByTopic = {
  topicId: string;
  topicLabel: string;
  items: NewsCluster[];
};

export type RisingTopic = {
  topicId: string;
  topicLabel: string;
  todayCount: number;
  yesterdayCount: number;
  delta: number;
  ratio: number;
};

export type BurstLevel = "상" | "중" | "하";

export type TopicDailyStat = {
  date: string;
  topicId: string;
  topicLabel: string;
  count: number;
  scoreSum: number;
  sourceDiversity: number;
  topSourceShare: number;
  burstZ: number;
  burstLevel: BurstLevel;
  lowHistory: boolean;
};

export type TopicTrendSeriesPoint = {
  date: string;
  count: number;
  scoreSum: number;
};

export type TopicTrend = {
  topicId: string;
  topicLabel: string;
  todayCount: number;
  yesterdayCount: number;
  delta: number;
  ratio: number;
  avgLast7d: number;
  stddevLast7d: number;
  burstZ: number;
  burstLevel: BurstLevel;
  lowHistory: boolean;
  sourceDiversity: number;
  topSourceShare: number;
  scoreSum: number;
  series: TopicTrendSeriesPoint[];
};

export type TopicTrendsArtifact = {
  generatedAt: string;
  timezone: "Asia/Seoul";
  todayKst: string;
  windowDays: number;
  topics: TopicTrend[];
  burstTopics: TopicTrend[];
};

export type NewsRuleSummary = {
  observation: string;
  evidenceLinks: string[];
  watchVariables: string[];
  counterSignals: string[];
};

export type DigestTopItem = {
  topicId: string;
  topicLabel: string;
  title: string;
  url: string;
  score: number;
  publishedAt: string;
  sourceName: string;
  // Advanced view only.
  snippet?: string;
};

export type DigestTopTopic = {
  topicId: string;
  topicLabel: string;
  count: number;
  scoreSum: number;
  burstLevel: BurstLevel;
};

export type DigestWatchView = "last" | "pctChange" | "zscore";

export type DigestWatchStatus = "ok" | "unknown";

export type DigestWatchItem = {
  label: string;
  seriesId: string;
  view: DigestWatchView;
  window: number;
  status: DigestWatchStatus;
  valueSummary: string;
  asOf?: string | null;
};

export type ScenarioCard = {
  name: "Base" | "Bull" | "Bear";
  confidence: "상" | "중" | "하";
  assumptions: string[];
  trigger: string[];
  invalidation: string[];
  indicators: string[];
  impactPath: string;
  monitoringOptions: string[];
};

export type DigestDay = {
  date: string;
  generatedAt: string;
  topItems: DigestTopItem[];
  topTopics: DigestTopTopic[];
  burstTopics: DigestTopTopic[];
  watchlist: DigestWatchItem[];
  scenarioCards: ScenarioCard[];
  summary: NewsRuleSummary;
};

export type NewsBrief = {
  generatedAt: string;
  stats: {
    totalItems: number;
    totalClusters: number;
    dedupedCount: number;
    feeds: number;
  };
  topToday: NewsCluster[];
  topByTopic: NewsTopByTopic[];
  risingTopics: RisingTopic[];
  summary: NewsRuleSummary;
};

export type MacroSnapshot = {
  asOf: string;
  source: string;
  values: {
    policyRatePct?: number;
    cpiYoYPct?: number;
    fxUsdKrw?: number;
    oilBrentUsd?: number;
  };
};

export type NewsScenario = {
  name: "Base" | "Bull" | "Bear";
  confidence: "상" | "중" | "하";
  assumptions: string[];
  trigger: string[];
  leadingIndicators: string[];
  invalidation: string[];
  impact: string;
  monitoringOptions: string[];
  rationale: string[];
};

export type NewsScenarioPack = {
  generatedAt: string;
  input: {
    topTopicIds: string[];
    risingTopicIds: string[];
    macroSnapshot: MacroSnapshot;
  };
  scenarios: NewsScenario[];
};

export type NewsRefreshRunResult = {
  generatedAt: string;
  fetchedFeeds: number;
  fetchedItems: number;
  insertedItems: number;
  dedupedItems: number;
  parseErrors: number;
  feedErrors: Array<{ feedId: string; message: string }>;
  brief: NewsBrief;
  digest: DigestDay;
  trends: TopicTrendsArtifact;
  scenarios: NewsScenarioPack;
};
