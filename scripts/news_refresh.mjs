import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { tsImport } from "tsx/esm/api";

function loadEnvFiles(cwd = process.cwd()) {
  for (const name of [".env.local", "env.local", ".env"]) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({ path: filePath, override: false, quiet: true });
  }
}

async function loadTsModule(modulePath) {
  const raw = await tsImport(modulePath, { parentURL: import.meta.url });
  return raw?.default && typeof raw.default === "object" ? raw.default : raw;
}

function requireFunction(module, name, moduleName) {
  const fn = module?.[name];
  if (typeof fn !== "function") {
    throw new Error(`missing export ${moduleName}.${name}`);
  }
  return fn;
}

async function loadNewsDeps() {
  const [
    dedupe,
    urlCanonical,
    feedFetch,
    feedParse,
    tagging,
    cluster,
    scenarioEngine,
    summary,
    storageSqlite,
    scoring,
    trend,
    indicatorsQuery,
  ] = await Promise.all([
    loadTsModule("../src/lib/news/dedupe.ts"),
    loadTsModule("../src/lib/news/urlCanonical.ts"),
    loadTsModule("../src/lib/news/feedFetch.ts"),
    loadTsModule("../src/lib/news/feedParse.ts"),
    loadTsModule("../src/lib/news/tagging.ts"),
    loadTsModule("../src/lib/news/cluster.ts"),
    loadTsModule("../src/lib/news/scenarioEngine.ts"),
    loadTsModule("../src/lib/news/summary.ts"),
    loadTsModule("../src/lib/news/storageSqlite.ts"),
    loadTsModule("../src/lib/news/scoring.ts"),
    loadTsModule("../src/lib/news/trend.ts"),
    loadTsModule("../src/lib/indicators/query.ts"),
  ]);

  return {
    buildContentHash: requireFunction(dedupe, "buildContentHash", "dedupe"),
    buildDedupeKey: requireFunction(dedupe, "buildDedupeKey", "dedupe"),
    dedupeNewsItems: requireFunction(dedupe, "dedupeNewsItems", "dedupe"),
    sha256: requireFunction(dedupe, "sha256", "dedupe"),
    canonicalizeUrl: requireFunction(urlCanonical, "canonicalizeUrl", "urlCanonical"),
    fetchFeedXml: requireFunction(feedFetch, "fetchFeedXml", "feedFetch"),
    parseFeedXml: requireFunction(feedParse, "parseFeedXml", "feedParse"),
    tagNewsItems: requireFunction(tagging, "tagNewsItems", "tagging"),
    clusterNewsItems: requireFunction(cluster, "clusterNewsItems", "cluster"),
    buildNewsScenarios: requireFunction(scenarioEngine, "buildNewsScenarios", "scenarioEngine"),
    toNewsScenarioMarkdown: requireFunction(scenarioEngine, "toNewsScenarioMarkdown", "scenarioEngine"),
    toScenarioCards: requireFunction(scenarioEngine, "toScenarioCards", "scenarioEngine"),
    buildNewsBrief: requireFunction(summary, "buildNewsBrief", "summary"),
    buildDigestDay: requireFunction(summary, "buildDigestDay", "summary"),
    buildRisingTopics: requireFunction(summary, "buildRisingTopics", "summary"),
    toNewsBriefMarkdown: requireFunction(summary, "toNewsBriefMarkdown", "summary"),
    toDigestDayMarkdown: requireFunction(summary, "toDigestDayMarkdown", "summary"),
    closeNewsDatabase: requireFunction(storageSqlite, "closeNewsDatabase", "storageSqlite"),
    openNewsDatabase: requireFunction(storageSqlite, "openNewsDatabase", "storageSqlite"),
    persistScoredNewsItems: requireFunction(storageSqlite, "persistScoredNewsItems", "storageSqlite"),
    pruneOldNewsItems: requireFunction(storageSqlite, "pruneOldNewsItems", "storageSqlite"),
    queryTopicCountsByPublishedRange: requireFunction(storageSqlite, "queryTopicCountsByPublishedRange", "storageSqlite"),
    queryTopicStatsByPublishedRange: requireFunction(storageSqlite, "queryTopicStatsByPublishedRange", "storageSqlite"),
    readDailyTopicCounts: requireFunction(storageSqlite, "readDailyTopicCounts", "storageSqlite"),
    readTopicDailyStatsRange: requireFunction(storageSqlite, "readTopicDailyStatsRange", "storageSqlite"),
    recordNewsRun: requireFunction(storageSqlite, "recordNewsRun", "storageSqlite"),
    replaceFeeds: requireFunction(storageSqlite, "replaceFeeds", "storageSqlite"),
    resolveNewsMacroOverridePath: requireFunction(storageSqlite, "resolveNewsMacroOverridePath", "storageSqlite"),
    upsertDailyTopicCounts: requireFunction(storageSqlite, "upsertDailyTopicCounts", "storageSqlite"),
    upsertTopicDailyStats: requireFunction(storageSqlite, "upsertTopicDailyStats", "storageSqlite"),
    writeNewsArtifacts: requireFunction(storageSqlite, "writeNewsArtifacts", "storageSqlite"),
    countByPrimaryTopic: requireFunction(scoring, "countByPrimaryTopic", "scoring"),
    scoreNewsItems: requireFunction(scoring, "scoreNewsItems", "scoring"),
    buildTopicTrendsArtifact: requireFunction(trend, "buildTopicTrendsArtifact", "trend"),
    buildWatchlistValues: requireFunction(indicatorsQuery, "buildWatchlistValues", "indicators.query"),
  };
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
  };
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function normalizeFeedConfig(raw) {
  const defaultTakeLatest = Math.max(1, Math.min(300, Math.round(asNumber(raw?.defaultTakeLatest, 50))));
  const feeds = asArray(raw?.feeds)
    .map((row, index) => {
      const id = asString(row?.id) || `feed-${index + 1}`;
      const name = asString(row?.name) || id;
      const url = asString(row?.url) || asString(row?.feedUrl);
      const weight = Math.max(0, Math.min(100, asNumber(row?.weight, 50)));
      const enabled = row?.enabled !== false;
      const takeLatest = Math.max(1, Math.min(300, Math.round(asNumber(row?.takeLatest, defaultTakeLatest))));
      if (!url) return null;
      return {
        id,
        name,
        url,
        homepageUrl: asString(row?.homepageUrl) || undefined,
        country: asString(row?.country) || undefined,
        language: asString(row?.language) || undefined,
        weight,
        enabled,
        takeLatest,
      };
    })
    .filter((row) => row !== null);

  return {
    version: Number.isInteger(raw?.version) ? raw.version : 1,
    generatedAt: asString(raw?.generatedAt) || null,
    defaultTakeLatest,
    feeds,
  };
}

function normalizeTopicDictionary(raw) {
  const fallbackTopic = {
    id: asString(raw?.fallbackTopic?.id) || "general",
    label: asString(raw?.fallbackTopic?.label) || "일반",
    watchVariables: asArray(raw?.fallbackTopic?.watchVariables).map((entry) => asString(entry)).filter(Boolean),
    counterSignals: asArray(raw?.fallbackTopic?.counterSignals).map((entry) => asString(entry)).filter(Boolean),
  };

  const topics = asArray(raw?.topics)
    .map((row, index) => {
      const id = asString(row?.id) || `topic-${index + 1}`;
      const label = asString(row?.label) || id;
      const keywords = asArray(row?.keywords).map((entry) => asString(entry)).filter(Boolean);
      const entities = asArray(row?.entities).map((entry) => asString(entry)).filter(Boolean);
      const watchVariables = asArray(row?.watchVariables).map((entry) => asString(entry)).filter(Boolean);
      const counterSignals = asArray(row?.counterSignals).map((entry) => asString(entry)).filter(Boolean);
      return {
        id,
        label,
        keywords,
        entities,
        watchVariables,
        counterSignals,
      };
    })
    .filter((row) => row.id && row.label);

  return {
    version: Number.isInteger(raw?.version) ? raw.version : 1,
    generatedAt: asString(raw?.generatedAt) || null,
    topics,
    fallbackTopic,
    stopwords: asArray(raw?.stopwords).map((entry) => asString(entry)).filter(Boolean),
  };
}

function normalizeScoringConfig(raw) {
  const recencyBuckets = asArray(raw?.recencyBuckets)
    .map((row) => ({
      maxHours: Math.max(1, Math.min(24 * 365, Math.round(asNumber(row?.maxHours, 24)))),
      score: Math.max(0, Math.min(100, asNumber(row?.score, 0))),
    }))
    .sort((a, b) => a.maxHours - b.maxHours);

  return {
    version: Number.isInteger(raw?.version) ? raw.version : 1,
    generatedAt: asString(raw?.generatedAt) || null,
    weights: {
      sourceMax: Math.max(0, Math.min(100, asNumber(raw?.weights?.sourceMax, 30))),
      keywordMax: Math.max(0, Math.min(100, asNumber(raw?.weights?.keywordMax, 35))),
      recencyMax: Math.max(0, Math.min(100, asNumber(raw?.weights?.recencyMax, 20))),
      focusMax: Math.max(0, Math.min(100, asNumber(raw?.weights?.focusMax, 10))),
    },
    recencyBuckets,
    defaults: {
      topN: Math.max(1, Math.min(50, Math.round(asNumber(raw?.defaults?.topN, 10)))),
      topM: Math.max(1, Math.min(20, Math.round(asNumber(raw?.defaults?.topM, 3)))),
      clusterWindowHours: Math.max(1, Math.min(240, Math.round(asNumber(raw?.defaults?.clusterWindowHours, 36)))),
      clusterMinJaccard: Math.max(0, Math.min(1, asNumber(raw?.defaults?.clusterMinJaccard, 0.55))),
      retentionDays: Math.max(1, Math.min(365, Math.round(asNumber(raw?.defaults?.retentionDays, 45)))),
      evidenceLinksMin: Math.max(1, Math.min(10, Math.round(asNumber(raw?.defaults?.evidenceLinksMin, 2)))),
      evidenceLinksMax: Math.max(1, Math.min(10, Math.round(asNumber(raw?.defaults?.evidenceLinksMax, 5)))),
      burstWindowDays: Math.max(3, Math.min(14, Math.round(asNumber(raw?.defaults?.burstWindowDays, 7)))),
      burstHistoryMinDays: Math.max(1, Math.min(7, Math.round(asNumber(raw?.defaults?.burstHistoryMinDays, 3)))),
    },
    relativeScore: {
      recencyBoost: {
        within24h: asNumber(raw?.relativeScore?.recencyBoost?.within24h, 1.0),
        within48h: asNumber(raw?.relativeScore?.recencyBoost?.within48h, 0.6),
        within7d: asNumber(raw?.relativeScore?.recencyBoost?.within7d, 0.2),
        otherwise: asNumber(raw?.relativeScore?.recencyBoost?.otherwise, 0),
      },
      keywordBoostCap: asNumber(raw?.relativeScore?.keywordBoostCap, 1.2),
      topicBurstBoost: {
        high: asNumber(raw?.relativeScore?.topicBurstBoost?.high, 0.4),
        mid: asNumber(raw?.relativeScore?.topicBurstBoost?.mid, 0.2),
        low: asNumber(raw?.relativeScore?.topicBurstBoost?.low, 0),
      },
      duplicatePenalty: asNumber(raw?.relativeScore?.duplicatePenalty, 0.7),
      diversityPenaltySlope: asNumber(raw?.relativeScore?.diversityPenaltySlope, 0.6),
      diversityPenaltyStart: asNumber(raw?.relativeScore?.diversityPenaltyStart, 0.5),
    },
    burst: {
      highThreshold: asNumber(raw?.burst?.highThreshold, 2.0),
      midThreshold: asNumber(raw?.burst?.midThreshold, 1.0),
    },
  };
}

function normalizeWatchlistConfig(raw) {
  const items = asArray(raw?.items)
    .map((row) => {
      const topicId = asString(row?.topicId) || "general";
      const label = asString(row?.label);
      const seriesId = asString(row?.seriesId);
      const viewToken = asString(row?.view);
      const view = viewToken === "pctChange" || viewToken === "zscore" ? viewToken : "last";
      const window = Math.max(1, Math.min(365, Math.round(asNumber(row?.window, 3))));
      if (!label || !seriesId) return null;
      return {
        topicId,
        label,
        seriesId,
        view,
        window,
      };
    })
    .filter((row) => row !== null);

  return {
    version: Number.isInteger(raw?.version) ? raw.version : 1,
    generatedAt: asString(raw?.generatedAt) || null,
    defaultTopK: Math.max(1, Math.min(12, Math.round(asNumber(raw?.defaultTopK, 6)))),
    items,
  };
}

function selectWatchlistSpecs(config, topicIds, limit) {
  const normalizedLimit = Math.max(1, Math.min(20, Math.round(asNumber(limit, 6))));
  const topicSet = new Set(topicIds.map((row) => asString(row)).filter(Boolean));
  const ranked = [
    ...config.items.filter((row) => topicSet.has(row.topicId)),
    ...config.items.filter((row) => row.topicId === "general"),
  ];

  const deduped = [];
  const seen = new Set();
  for (const row of ranked) {
    const key = `${row.label}|${row.seriesId}|${row.view}|${row.window}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= normalizedLimit) break;
  }
  return deduped;
}

function compareByPublishedDesc(a, b) {
  if (a.publishedAt !== b.publishedAt) return String(b.publishedAt).localeCompare(String(a.publishedAt));
  return String(a.url).localeCompare(String(b.url));
}

function limitFeedEntries(entries, takeLatest) {
  return [...entries].sort(compareByPublishedDesc).slice(0, takeLatest);
}

function nowIso() {
  return new Date().toISOString();
}

function formatKstDay(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function shiftKstDay(dayKst, deltaDays) {
  const [year, month, day] = dayKst.split("-").map((token) => Number(token));
  const base = Date.UTC(year, month - 1, day, 12, 0, 0);
  const shifted = base + deltaDays * 24 * 60 * 60 * 1000;
  return formatKstDay(new Date(shifted));
}

function kstDayRangeToUtc(dayKst) {
  const [year, month, day] = dayKst.split("-").map((token) => Number(token));
  const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

function loadMacroSnapshot(cwd, generatedAt, resolveNewsMacroOverridePath) {
  const assumptionsPath = path.join(cwd, ".data", "planning", "assumptions.latest.json");
  const assumptions = readJson(assumptionsPath, null);
  const overridePath = resolveNewsMacroOverridePath(cwd);
  const override = readJson(overridePath, null);

  return {
    asOf: asString(override?.asOf) || asString(assumptions?.asOf) || generatedAt,
    source: [
      assumptions ? "planning.assumptions" : null,
      override ? "news.macro_override" : null,
    ].filter(Boolean).join("+") || "none",
    values: {
      policyRatePct: Number.isFinite(Number(override?.policyRatePct))
        ? Number(override.policyRatePct)
        : (Number.isFinite(Number(assumptions?.korea?.policyRatePct)) ? Number(assumptions.korea.policyRatePct) : undefined),
      cpiYoYPct: Number.isFinite(Number(override?.cpiYoYPct))
        ? Number(override.cpiYoYPct)
        : (Number.isFinite(Number(assumptions?.korea?.cpiYoYPct)) ? Number(assumptions.korea.cpiYoYPct) : undefined),
      fxUsdKrw: Number.isFinite(Number(override?.fxUsdKrw)) ? Number(override.fxUsdKrw) : undefined,
      oilBrentUsd: Number.isFinite(Number(override?.oilBrentUsd)) ? Number(override.oilBrentUsd) : undefined,
    },
  };
}

function duplicateCountsByDedupeKey(items) {
  const map = new Map();
  for (const row of items) {
    const key = asString(row.dedupeKey);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function topicStatsFromScored(items, dateKst) {
  const byTopic = new Map();
  for (const item of items) {
    const key = item.primaryTopicId;
    const row = byTopic.get(key) ?? {
      topicId: item.primaryTopicId,
      topicLabel: item.primaryTopicLabel,
      count: 0,
      scoreSum: 0,
      sourceCounts: new Map(),
    };
    row.count += 1;
    row.scoreSum += asNumber(item.relativeScore, asNumber(item.totalScore, 0));
    const sourceId = asString(item.sourceId) || "unknown";
    row.sourceCounts.set(sourceId, (row.sourceCounts.get(sourceId) ?? 0) + 1);
    byTopic.set(key, row);
  }

  return [...byTopic.values()].map((row) => {
    let top = 0;
    for (const count of row.sourceCounts.values()) {
      if (count > top) top = count;
    }
    const diversity = row.count > 0 ? row.sourceCounts.size / row.count : 0;
    const topShare = row.count > 0 ? top / row.count : 1;
    return {
      date: dateKst,
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      scoreSum: Math.round(row.scoreSum * 100) / 100,
      sourceDiversity: Math.round(diversity * 100) / 100,
      topSourceShare: Math.round(topShare * 100) / 100,
      burstZ: 0,
      burstLevel: "하",
      lowHistory: true,
    };
  });
}

function topicStatsFromRangeRows(rows, dayKst) {
  return rows.map((row) => ({
    date: dayKst,
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    count: row.count,
    scoreSum: row.scoreSum,
    sourceDiversity: row.sourceDiversity,
    topSourceShare: row.topSourceShare,
    burstZ: 0,
    burstLevel: "하",
    lowHistory: true,
  }));
}

async function main() {
  const cwd = process.cwd();
  loadEnvFiles(cwd);
  const args = parseArgs(process.argv.slice(2));
  const deps = await loadNewsDeps();
  const {
    buildContentHash,
    buildDedupeKey,
    dedupeNewsItems,
    sha256,
    canonicalizeUrl,
    fetchFeedXml,
    parseFeedXml,
    tagNewsItems,
    clusterNewsItems,
    buildNewsScenarios,
    toNewsScenarioMarkdown,
    toScenarioCards,
    buildNewsBrief,
    buildDigestDay,
    buildRisingTopics,
    toNewsBriefMarkdown,
    toDigestDayMarkdown,
    closeNewsDatabase,
    openNewsDatabase,
    persistScoredNewsItems,
    pruneOldNewsItems,
    queryTopicCountsByPublishedRange,
    queryTopicStatsByPublishedRange,
    readDailyTopicCounts,
    readTopicDailyStatsRange,
    recordNewsRun,
    replaceFeeds,
    resolveNewsMacroOverridePath,
    upsertDailyTopicCounts,
    upsertTopicDailyStats,
    writeNewsArtifacts,
    countByPrimaryTopic,
    scoreNewsItems,
    buildTopicTrendsArtifact,
    buildWatchlistValues,
  } = deps;

  const feedsConfig = normalizeFeedConfig(readJson(path.join(cwd, "config", "news-feeds.json"), { version: 1, feeds: [] }));
  const topicDictionary = normalizeTopicDictionary(readJson(path.join(cwd, "config", "news-topic-dictionary.json"), {
    version: 1,
    topics: [],
    fallbackTopic: { id: "general", label: "일반" },
  }));
  const scoringConfig = normalizeScoringConfig(readJson(path.join(cwd, "config", "news-scoring.json"), {
    version: 1,
    weights: { sourceMax: 30, keywordMax: 35, recencyMax: 20, focusMax: 10 },
    recencyBuckets: [],
    defaults: {
      topN: 10,
      topM: 3,
      clusterWindowHours: 36,
      clusterMinJaccard: 0.55,
      retentionDays: 45,
      evidenceLinksMin: 2,
      evidenceLinksMax: 5,
      burstWindowDays: 7,
      burstHistoryMinDays: 3,
    },
  }));
  const watchlistConfig = normalizeWatchlistConfig(readJson(path.join(cwd, "config", "news-watchlist.json"), {
    version: 1,
    defaultTopK: 6,
    items: [],
  }));

  const generatedAt = nowIso();
  const todayKst = formatKstDay(generatedAt);
  const enabledFeeds = feedsConfig.feeds.filter((feed) => feed.enabled);
  const feedErrors = [];
  let parseErrors = 0;
  let fetchedItems = 0;
  const collected = [];

  const db = openNewsDatabase();
  try {
    replaceFeeds(db, feedsConfig.feeds, generatedAt);

    for (const feed of enabledFeeds) {
      const fetched = await fetchFeedXml(feed);
      if (!fetched.ok || !fetched.xml) {
        feedErrors.push({ feedId: feed.id, message: fetched.message ?? "fetch failed" });
        continue;
      }

      try {
        const parsed = parseFeedXml(fetched.xml);
        const limited = limitFeedEntries(parsed, feed.takeLatest ?? feedsConfig.defaultTakeLatest);
        fetchedItems += limited.length;

        for (const entry of limited) {
          const canonicalUrl = canonicalizeUrl(entry.url);
          if (!canonicalUrl) continue;
          const publishedAt = asString(entry.publishedAt) || generatedAt;
          const snippet = asString(entry.snippet) || asString(entry.description) || "";
          const contentHash = buildContentHash(entry.title, snippet);
          const dedupeKey = buildDedupeKey(entry.title, snippet, publishedAt);
          const id = sha256(`${feed.id}|${asString(entry.feedItemId) || canonicalUrl}|${dedupeKey}`);

          collected.push({
            id,
            sourceId: feed.id,
            sourceName: feed.name,
            feedItemId: asString(entry.feedItemId) || undefined,
            url: entry.url,
            canonicalUrl,
            title: entry.title,
            snippet,
            description: snippet,
            publishedAt,
            fetchedAt: generatedAt,
            contentHash,
            dedupeKey,
            sourceWeight: feed.weight,
          });
        }
      } catch (error) {
        parseErrors += 1;
        feedErrors.push({
          feedId: feed.id,
          message: error instanceof Error ? error.message : "parse failed",
        });
      }
    }

    const duplicateCounts = duplicateCountsByDedupeKey(collected);
    const deduped = dedupeNewsItems(collected);
    const tagged = tagNewsItems(deduped.items, topicDictionary);

    const historyStartKst = shiftKstDay(todayKst, -Math.max(29, scoringConfig.defaults.burstWindowDays + 2));
    const historyEndKst = shiftKstDay(todayKst, -1);
    const historyRows = readTopicDailyStatsRange(db, historyStartKst, historyEndKst);
    const provisionalTodayStats = topicStatsFromScored(tagged.map((item) => ({
      ...item,
      relativeScore: 0,
      totalScore: 0,
    })), todayKst);
    const provisionalTrends = buildTopicTrendsArtifact({
      generatedAt,
      todayKst,
      rows: [...historyRows, ...provisionalTodayStats],
      windowDays: 30,
      burstWindowDays: scoringConfig.defaults.burstWindowDays,
      historyMinDays: scoringConfig.defaults.burstHistoryMinDays,
      highThreshold: scoringConfig.burst.highThreshold,
      midThreshold: scoringConfig.burst.midThreshold,
    });
    const burstLevelsByTopic = new Map(provisionalTrends.topics.map((row) => [row.topicId, row.burstLevel]));

    const topicCounts = countByPrimaryTopic(tagged);
    const scored = scoreNewsItems(tagged, scoringConfig, {
      nowIso: generatedAt,
      topicCounts,
      burstLevelsByTopic,
      duplicateCountsByKey: duplicateCounts,
    });

    const clusters = clusterNewsItems(scored, {
      windowHours: scoringConfig.defaults.clusterWindowHours,
      minJaccard: scoringConfig.defaults.clusterMinJaccard,
    });

    const persisted = persistScoredNewsItems(db, scored, generatedAt);

    const cutoffTs = Date.parse(generatedAt) - scoringConfig.defaults.retentionDays * 24 * 60 * 60 * 1000;
    pruneOldNewsItems(db, new Date(cutoffTs).toISOString());

    const yesterdayKst = shiftKstDay(todayKst, -1);
    const todayRange = kstDayRangeToUtc(todayKst);
    const yesterdayRange = kstDayRangeToUtc(yesterdayKst);

    const todayCounts = queryTopicCountsByPublishedRange(db, todayRange.startIso, todayRange.endIso);
    const yesterdayCounts = queryTopicCountsByPublishedRange(db, yesterdayRange.startIso, yesterdayRange.endIso);

    upsertDailyTopicCounts(db, todayKst, todayCounts, generatedAt);
    upsertDailyTopicCounts(db, yesterdayKst, yesterdayCounts, generatedAt);

    const todaySnapshot = readDailyTopicCounts(db, todayKst);
    const yesterdaySnapshot = readDailyTopicCounts(db, yesterdayKst);

    const yesterdayMap = new Map(yesterdaySnapshot.map((row) => [row.topicId, row]));
    const trendRows = todaySnapshot.map((row) => {
      const prev = yesterdayMap.get(row.topicId);
      return {
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        todayCount: row.count,
        yesterdayCount: prev?.count ?? 0,
      };
    });
    const risingTopics = buildRisingTopics(trendRows);

    for (let offset = 29; offset >= 0; offset -= 1) {
      const dayKst = shiftKstDay(todayKst, -offset);
      const range = kstDayRangeToUtc(dayKst);
      const rows = queryTopicStatsByPublishedRange(db, range.startIso, range.endIso);
      upsertTopicDailyStats(db, dayKst, topicStatsFromRangeRows(rows, dayKst), generatedAt);
    }

    const statsRows = readTopicDailyStatsRange(db, shiftKstDay(todayKst, -29), todayKst);
    const trends = buildTopicTrendsArtifact({
      generatedAt,
      todayKst,
      rows: statsRows,
      windowDays: 30,
      burstWindowDays: scoringConfig.defaults.burstWindowDays,
      historyMinDays: scoringConfig.defaults.burstHistoryMinDays,
      highThreshold: scoringConfig.burst.highThreshold,
      midThreshold: scoringConfig.burst.midThreshold,
    });

    const todayStatsByTopic = new Map(trends.topics.map((row) => [row.topicId, row]));
    const todayStatsRows = queryTopicStatsByPublishedRange(db, todayRange.startIso, todayRange.endIso);
    const todayStatsWithBurst = todayStatsRows.map((row) => {
      const trend = todayStatsByTopic.get(row.topicId);
      return {
        date: todayKst,
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        count: row.count,
        scoreSum: row.scoreSum,
        sourceDiversity: row.sourceDiversity,
        topSourceShare: row.topSourceShare,
        burstZ: trend?.burstZ ?? 0,
        burstLevel: trend?.burstLevel ?? "하",
        lowHistory: trend?.lowHistory ?? true,
      };
    });
    upsertTopicDailyStats(db, todayKst, todayStatsWithBurst, generatedAt);

    const brief = buildNewsBrief({
      generatedAt,
      scoredItems: scored,
      clusters,
      feeds: enabledFeeds.length,
      dedupedCount: deduped.dedupedCount,
      topN: scoringConfig.defaults.topN,
      topM: scoringConfig.defaults.topM,
      risingTopics,
      evidenceLinksMin: scoringConfig.defaults.evidenceLinksMin,
      evidenceLinksMax: scoringConfig.defaults.evidenceLinksMax,
    });

    const macroSnapshot = loadMacroSnapshot(cwd, generatedAt, resolveNewsMacroOverridePath);
    const scenarios = buildNewsScenarios({
      generatedAt,
      risingTopics: brief.risingTopics,
      topClusters: brief.topToday,
      macroSnapshot,
    });
    const scenarioCards = toScenarioCards(scenarios);
    const topicPriority = [
      ...new Set([
        ...brief.risingTopics.map((row) => row.topicId),
        ...trends.topics.slice(0, scoringConfig.defaults.topM).map((row) => row.topicId),
      ].map((row) => asString(row)).filter(Boolean)),
    ];
    const watchSpecs = selectWatchlistSpecs(
      watchlistConfig,
      topicPriority,
      Math.max(watchlistConfig.defaultTopK, scoringConfig.defaults.topM * 2),
    );
    const watchlistItems = buildWatchlistValues({
      specs: watchSpecs.map((row) => ({
        label: row.label,
        seriesId: row.seriesId,
        view: row.view,
        window: row.window,
      })),
      cwd,
    });

    const digest = buildDigestDay({
      generatedAt,
      dateKst: todayKst,
      brief,
      trends: trends.topics,
      scenarioCards,
      watchlistItems,
      topItemsLimit: scoringConfig.defaults.topN,
      topTopicsLimit: scoringConfig.defaults.topM,
    });

    writeNewsArtifacts({
      brief,
      scenarios,
      trends,
      digestDay: digest,
      briefMarkdown: toNewsBriefMarkdown(brief),
      scenarioMarkdown: toNewsScenarioMarkdown(scenarios),
      digestMarkdown: toDigestDayMarkdown(digest),
      cwd,
    });

    const runId = `news-${generatedAt.replace(/[^0-9]/g, "").slice(0, 17)}`;
    recordNewsRun(db, {
      runId,
      generatedAt,
      fetchedFeeds: enabledFeeds.length,
      fetchedItems,
      insertedItems: persisted.insertedItems,
      dedupedItems: deduped.dedupedCount,
      parseErrors,
      feedErrors: feedErrors.length,
    });

    console.log(`[news:refresh] feeds=${enabledFeeds.length}, fetchedItems=${fetchedItems}, deduped=${deduped.dedupedCount}, inserted=${persisted.insertedItems}`);
    console.log(`[news:refresh] topToday=${brief.topToday.length}, topByTopic=${brief.topByTopic.length}, risingTopics=${brief.risingTopics.length}, burstTopics=${trends.burstTopics.length}`);
    if (feedErrors.length > 0) {
      console.error(`[news:refresh] feed errors=${feedErrors.length}`);
      for (const row of feedErrors.slice(0, 10)) {
        console.error(`  - ${row.feedId}: ${row.message}`);
      }
    }

    if (args.strict && feedErrors.length > 0) {
      return 1;
    }
    return 0;
  } finally {
    closeNewsDatabase(db);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[news:refresh] failed: ${message}`);
  return 1;
}).then((code) => {
  process.exit(typeof code === "number" ? code : 1);
});
