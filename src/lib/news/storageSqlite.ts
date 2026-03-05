import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDataDir } from "../planning/storage/dataDir.ts";
import { type DigestDay, type NewsFeedConfig, type NewsScenarioPack, type NewsBrief, type ScoredNewsItem, type TopicDailyStat, type TopicTrendsArtifact } from "./types.ts";

export type TopicCountSnapshot = {
  topicId: string;
  topicLabel: string;
  count: number;
};

export type TopicStatsSnapshot = {
  topicId: string;
  topicLabel: string;
  count: number;
  scoreSum: number;
  sourceDiversity: number;
  topSourceShare: number;
};

export type NewsDbRunSummary = {
  runId: string;
  generatedAt: string;
  fetchedFeeds: number;
  fetchedItems: number;
  insertedItems: number;
  dedupedItems: number;
  parseErrors: number;
  feedErrors: number;
};

type NewsDb = InstanceType<typeof Database>;

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

function isCorruptedNewsDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("database disk image is malformed")
    || normalized.includes("file is not a database")
    || normalized.includes("malformed database schema");
}

function backupCorruptedNewsDbFiles(dbPath: string): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const backupPath = `${dbPath}.corrupt.${stamp}`;
  const pairs: Array<{ from: string; to: string }> = [
    { from: dbPath, to: backupPath },
    { from: `${dbPath}-wal`, to: `${backupPath}-wal` },
    { from: `${dbPath}-shm`, to: `${backupPath}-shm` },
  ];

  for (const row of pairs) {
    if (!fs.existsSync(row.from)) continue;
    try {
      fs.renameSync(row.from, row.to);
    } catch {
      // Best-effort backup. If file move fails we keep trying the rest.
    }
  }

  return backupPath;
}

export function resolveNewsDataDir(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "news");
}

export function resolveNewsDbPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "news.sqlite");
}

export function resolveNewsBriefJsonPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "news_brief.latest.json");
}

export function resolveNewsBriefMarkdownPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "news_brief.latest.md");
}

export function resolveNewsScenarioJsonPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "news_scenarios.latest.json");
}

export function resolveNewsScenarioMarkdownPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "news_scenarios.latest.md");
}

export function resolveNewsTrendsJsonPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "topic_trends.latest.json");
}

export function resolveNewsDigestDayJsonPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "digest_day.latest.json");
}

export function resolveNewsDigestDayMarkdownPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "digest_day.latest.md");
}

export function resolveNewsSearchIndexPath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "index.json");
}

export function resolveNewsMacroOverridePath(cwd = process.cwd()): string {
  return path.join(resolveNewsDataDir(cwd), "macro_override.json");
}

function ensureNewsDir(cwd = process.cwd()): string {
  const dir = resolveNewsDataDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  weight REAL NOT NULL,
  enabled INTEGER NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  sourceId TEXT NOT NULL,
  sourceName TEXT NOT NULL,
  feedItemId TEXT,
  url TEXT NOT NULL,
  canonicalUrl TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  publishedAt TEXT NOT NULL,
  fetchedAt TEXT NOT NULL,
  contentHash TEXT NOT NULL,
  dedupeKey TEXT NOT NULL,
  sourceWeight REAL NOT NULL DEFAULT 0,
  sourceScore REAL NOT NULL DEFAULT 0,
  keywordScore REAL NOT NULL DEFAULT 0,
  recencyScore REAL NOT NULL DEFAULT 0,
  focusScore REAL NOT NULL DEFAULT 0,
  totalScore REAL NOT NULL DEFAULT 0,
  relativeScore REAL NOT NULL DEFAULT 0,
  scorePartsJson TEXT NOT NULL DEFAULT '{}',
  primaryTopicId TEXT NOT NULL DEFAULT 'general',
  primaryTopicLabel TEXT NOT NULL DEFAULT '일반',
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_items_publishedAt ON news_items(publishedAt DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_canonicalUrl ON news_items(canonicalUrl);
CREATE INDEX IF NOT EXISTS idx_news_items_dedupeKey ON news_items(dedupeKey);
CREATE INDEX IF NOT EXISTS idx_news_items_primaryTopic ON news_items(primaryTopicId);

CREATE TABLE IF NOT EXISTS news_item_topics (
  itemId TEXT NOT NULL,
  topicId TEXT NOT NULL,
  topicLabel TEXT NOT NULL,
  score REAL NOT NULL,
  isPrimary INTEGER NOT NULL,
  keywordMatches TEXT NOT NULL,
  entityMatches TEXT NOT NULL,
  tfidfBoost REAL NOT NULL,
  PRIMARY KEY (itemId, topicId),
  FOREIGN KEY (itemId) REFERENCES news_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_topic_counts (
  dayKst TEXT NOT NULL,
  topicId TEXT NOT NULL,
  topicLabel TEXT NOT NULL,
  itemCount INTEGER NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (dayKst, topicId)
);

CREATE TABLE IF NOT EXISTS topic_daily_stats (
  dayKst TEXT NOT NULL,
  topicId TEXT NOT NULL,
  topicLabel TEXT NOT NULL,
  itemCount INTEGER NOT NULL,
  scoreSum REAL NOT NULL,
  sourceDiversity REAL NOT NULL,
  topSourceShare REAL NOT NULL,
  burstZ REAL NOT NULL DEFAULT 0,
  burstLevel TEXT NOT NULL DEFAULT '하',
  lowHistory INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (dayKst, topicId)
);

CREATE TABLE IF NOT EXISTS news_runs (
  runId TEXT PRIMARY KEY,
  generatedAt TEXT NOT NULL,
  fetchedFeeds INTEGER NOT NULL,
  fetchedItems INTEGER NOT NULL,
  insertedItems INTEGER NOT NULL,
  dedupedItems INTEGER NOT NULL,
  parseErrors INTEGER NOT NULL,
  feedErrors INTEGER NOT NULL,
  note TEXT
);
`;

function addColumnIfMissing(db: NewsDb, tableName: string, columnName: string, ddl: string): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>;
  const hasColumn = rows.some((row) => asString(row.name) === columnName);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddl}`);
  }
}

function ensureSchemaCompatibility(db: NewsDb): void {
  addColumnIfMissing(db, "news_items", "snippet", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "news_items", "description", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "news_items", "relativeScore", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "news_items", "scorePartsJson", "TEXT NOT NULL DEFAULT '{}'");
}

export function openNewsDatabase(dbPath = resolveNewsDbPath()): NewsDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  let db: NewsDb | null = null;
  try {
    db = new Database(dbPath);
    db.exec(SCHEMA_SQL);
    ensureSchemaCompatibility(db);
    return db;
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch {
        // noop
      }
    }
    if (!isCorruptedNewsDbError(error)) {
      throw error;
    }

    const backupPath = backupCorruptedNewsDbFiles(dbPath);
    console.warn(`[news:db] corrupted db detected. recreated from empty db. backup=${backupPath}`);

    const recovered = new Database(dbPath);
    recovered.exec(SCHEMA_SQL);
    ensureSchemaCompatibility(recovered);
    return recovered;
  }
}

export function closeNewsDatabase(db: NewsDb): void {
  db.close();
}

export function replaceFeeds(db: NewsDb, feeds: NewsFeedConfig[], updatedAt: string): void {
  const deleteStmt = db.prepare("DELETE FROM feeds");
  const insertStmt = db.prepare(`
    INSERT INTO feeds (id, name, url, weight, enabled, updatedAt)
    VALUES (@id, @name, @url, @weight, @enabled, @updatedAt)
  `);

  const tx = db.transaction(() => {
    deleteStmt.run();
    for (const feed of feeds) {
      insertStmt.run({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        weight: feed.weight,
        enabled: feed.enabled ? 1 : 0,
        updatedAt,
      });
    }
  });

  tx();
}

export function persistScoredNewsItems(db: NewsDb, items: ScoredNewsItem[], createdAt: string): { insertedItems: number } {
  const selectExists = db.prepare("SELECT id FROM news_items WHERE id = ?");
  const upsertItem = db.prepare(`
    INSERT INTO news_items (
      id, sourceId, sourceName, feedItemId, url, canonicalUrl, title, snippet, description,
      publishedAt, fetchedAt, contentHash, dedupeKey,
      sourceWeight, sourceScore, keywordScore, recencyScore, focusScore, totalScore,
      relativeScore, scorePartsJson,
      primaryTopicId, primaryTopicLabel, createdAt
    ) VALUES (
      @id, @sourceId, @sourceName, @feedItemId, @url, @canonicalUrl, @title, @snippet, @description,
      @publishedAt, @fetchedAt, @contentHash, @dedupeKey,
      @sourceWeight, @sourceScore, @keywordScore, @recencyScore, @focusScore, @totalScore,
      @relativeScore, @scorePartsJson,
      @primaryTopicId, @primaryTopicLabel, @createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      sourceId = excluded.sourceId,
      sourceName = excluded.sourceName,
      feedItemId = excluded.feedItemId,
      url = excluded.url,
      canonicalUrl = excluded.canonicalUrl,
      title = excluded.title,
      snippet = excluded.snippet,
      description = excluded.description,
      publishedAt = excluded.publishedAt,
      fetchedAt = excluded.fetchedAt,
      contentHash = excluded.contentHash,
      dedupeKey = excluded.dedupeKey,
      sourceWeight = excluded.sourceWeight,
      sourceScore = excluded.sourceScore,
      keywordScore = excluded.keywordScore,
      recencyScore = excluded.recencyScore,
      focusScore = excluded.focusScore,
      totalScore = excluded.totalScore,
      relativeScore = excluded.relativeScore,
      scorePartsJson = excluded.scorePartsJson,
      primaryTopicId = excluded.primaryTopicId,
      primaryTopicLabel = excluded.primaryTopicLabel
  `);
  const deleteTopics = db.prepare("DELETE FROM news_item_topics WHERE itemId = ?");
  const insertTopic = db.prepare(`
    INSERT INTO news_item_topics (
      itemId, topicId, topicLabel, score, isPrimary, keywordMatches, entityMatches, tfidfBoost
    ) VALUES (
      @itemId, @topicId, @topicLabel, @score, @isPrimary, @keywordMatches, @entityMatches, @tfidfBoost
    )
  `);

  let insertedItems = 0;

  const tx = db.transaction(() => {
    for (const item of items) {
      const exists = selectExists.get(item.id);
      if (!exists) insertedItems += 1;

      upsertItem.run({
        id: item.id,
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        feedItemId: item.feedItemId ?? null,
        url: item.url,
        canonicalUrl: item.canonicalUrl,
        title: item.title,
        snippet: item.snippet ?? item.description ?? "",
        description: item.description ?? item.snippet ?? "",
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
        contentHash: item.contentHash,
        dedupeKey: item.dedupeKey,
        sourceWeight: item.sourceWeight,
        sourceScore: item.sourceScore,
        keywordScore: item.keywordScore,
        recencyScore: item.recencyScore,
        focusScore: item.focusScore,
        totalScore: item.totalScore,
        relativeScore: item.relativeScore,
        scorePartsJson: JSON.stringify(item.scoreParts ?? {}),
        primaryTopicId: item.primaryTopicId,
        primaryTopicLabel: item.primaryTopicLabel,
        createdAt,
      });

      deleteTopics.run(item.id);
      for (const tag of item.tags) {
        insertTopic.run({
          itemId: item.id,
          topicId: tag.topicId,
          topicLabel: tag.topicLabel,
          score: tag.score,
          isPrimary: tag.topicId === item.primaryTopicId ? 1 : 0,
          keywordMatches: JSON.stringify(tag.keywordMatches),
          entityMatches: JSON.stringify(tag.entityMatches),
          tfidfBoost: tag.tfidfBoost,
        });
      }
    }
  });

  tx();

  return { insertedItems };
}

export function pruneOldNewsItems(db: NewsDb, cutoffIso: string): number {
  const result = db.prepare("DELETE FROM news_items WHERE publishedAt < ?").run(cutoffIso);
  return Math.max(0, result.changes);
}

export function recordNewsRun(db: NewsDb, run: NewsDbRunSummary): void {
  db.prepare(`
    INSERT INTO news_runs (
      runId, generatedAt, fetchedFeeds, fetchedItems, insertedItems,
      dedupedItems, parseErrors, feedErrors, note
    ) VALUES (
      @runId, @generatedAt, @fetchedFeeds, @fetchedItems, @insertedItems,
      @dedupedItems, @parseErrors, @feedErrors, @note
    )
  `).run({
    ...run,
    note: null,
  });
}

export function queryTopicCountsByPublishedRange(
  db: NewsDb,
  startIso: string,
  endIso: string,
): TopicCountSnapshot[] {
  const rows = db.prepare(`
    SELECT
      primaryTopicId AS topicId,
      primaryTopicLabel AS topicLabel,
      COUNT(1) AS itemCount
    FROM news_items
    WHERE publishedAt >= ? AND publishedAt < ?
    GROUP BY primaryTopicId, primaryTopicLabel
    ORDER BY itemCount DESC, topicLabel ASC
  `).all(startIso, endIso) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    topicId: asString(row.topicId),
    topicLabel: asString(row.topicLabel),
    count: Math.max(0, Math.round(asNumber(row.itemCount, 0))),
  }));
}

export function queryTopicStatsByPublishedRange(
  db: NewsDb,
  startIso: string,
  endIso: string,
): TopicStatsSnapshot[] {
  const rows = db.prepare(`
    WITH per_source AS (
      SELECT
        primaryTopicId AS topicId,
        primaryTopicLabel AS topicLabel,
        sourceId AS sourceId,
        COUNT(1) AS itemCount,
        SUM(relativeScore) AS scoreSum
      FROM news_items
      WHERE publishedAt >= ? AND publishedAt < ?
      GROUP BY primaryTopicId, primaryTopicLabel, sourceId
    ),
    per_topic AS (
      SELECT
        topicId,
        topicLabel,
        SUM(itemCount) AS totalCount,
        SUM(scoreSum) AS totalScore,
        COUNT(1) AS uniqueSources,
        MAX(itemCount) AS topSourceCount
      FROM per_source
      GROUP BY topicId, topicLabel
    )
    SELECT
      topicId,
      topicLabel,
      totalCount,
      totalScore,
      uniqueSources,
      topSourceCount
    FROM per_topic
    ORDER BY totalCount DESC, topicLabel ASC
  `).all(startIso, endIso) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const count = Math.max(0, Math.round(asNumber(row.totalCount, 0)));
    const uniqueSources = Math.max(0, Math.round(asNumber(row.uniqueSources, 0)));
    const topSourceCount = Math.max(0, Math.round(asNumber(row.topSourceCount, 0)));
    return {
      topicId: asString(row.topicId),
      topicLabel: asString(row.topicLabel),
      count,
      scoreSum: round2(asNumber(row.totalScore, 0)),
      sourceDiversity: count > 0 ? round2(uniqueSources / count) : 0,
      topSourceShare: count > 0 ? round2(topSourceCount / count) : 1,
    };
  });
}

export function upsertDailyTopicCounts(
  db: NewsDb,
  dayKst: string,
  rows: TopicCountSnapshot[],
  updatedAt: string,
): void {
  const deleteStmt = db.prepare("DELETE FROM daily_topic_counts WHERE dayKst = ?");
  const insertStmt = db.prepare(`
    INSERT INTO daily_topic_counts (dayKst, topicId, topicLabel, itemCount, updatedAt)
    VALUES (@dayKst, @topicId, @topicLabel, @itemCount, @updatedAt)
  `);

  const tx = db.transaction(() => {
    deleteStmt.run(dayKst);
    for (const row of rows) {
      insertStmt.run({
        dayKst,
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        itemCount: row.count,
        updatedAt,
      });
    }
  });

  tx();
}

export function readDailyTopicCounts(db: NewsDb, dayKst: string): TopicCountSnapshot[] {
  const rows = db.prepare(`
    SELECT topicId, topicLabel, itemCount
    FROM daily_topic_counts
    WHERE dayKst = ?
    ORDER BY itemCount DESC, topicLabel ASC
  `).all(dayKst) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    topicId: asString(row.topicId),
    topicLabel: asString(row.topicLabel),
    count: Math.max(0, Math.round(asNumber(row.itemCount, 0))),
  }));
}

export function upsertTopicDailyStats(
  db: NewsDb,
  dayKst: string,
  rows: TopicDailyStat[],
  updatedAt: string,
): void {
  const deleteStmt = db.prepare("DELETE FROM topic_daily_stats WHERE dayKst = ?");
  const insertStmt = db.prepare(`
    INSERT INTO topic_daily_stats (
      dayKst, topicId, topicLabel, itemCount, scoreSum,
      sourceDiversity, topSourceShare, burstZ, burstLevel, lowHistory, updatedAt
    ) VALUES (
      @dayKst, @topicId, @topicLabel, @itemCount, @scoreSum,
      @sourceDiversity, @topSourceShare, @burstZ, @burstLevel, @lowHistory, @updatedAt
    )
  `);

  const tx = db.transaction(() => {
    deleteStmt.run(dayKst);
    for (const row of rows) {
      insertStmt.run({
        dayKst,
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        itemCount: row.count,
        scoreSum: row.scoreSum,
        sourceDiversity: row.sourceDiversity,
        topSourceShare: row.topSourceShare,
        burstZ: row.burstZ,
        burstLevel: row.burstLevel,
        lowHistory: row.lowHistory ? 1 : 0,
        updatedAt,
      });
    }
  });

  tx();
}

export function readTopicDailyStatsRange(
  db: NewsDb,
  startDayKst: string,
  endDayKst: string,
): TopicDailyStat[] {
  const rows = db.prepare(`
    SELECT
      dayKst, topicId, topicLabel, itemCount, scoreSum,
      sourceDiversity, topSourceShare, burstZ, burstLevel, lowHistory
    FROM topic_daily_stats
    WHERE dayKst >= ? AND dayKst <= ?
    ORDER BY dayKst ASC, itemCount DESC, topicLabel ASC
  `).all(startDayKst, endDayKst) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    date: asString(row.dayKst),
    topicId: asString(row.topicId),
    topicLabel: asString(row.topicLabel),
    count: Math.max(0, Math.round(asNumber(row.itemCount, 0))),
    scoreSum: round2(asNumber(row.scoreSum, 0)),
    sourceDiversity: round2(asNumber(row.sourceDiversity, 0)),
    topSourceShare: round2(asNumber(row.topSourceShare, 1)),
    burstZ: round2(asNumber(row.burstZ, 0)),
    burstLevel: (asString(row.burstLevel) || "하") as TopicDailyStat["burstLevel"],
    lowHistory: Math.round(asNumber(row.lowHistory, 0)) === 1,
  }));
}

export function writeNewsArtifacts(input: {
  brief: NewsBrief;
  scenarios: NewsScenarioPack;
  briefMarkdown: string;
  scenarioMarkdown: string;
  trends?: TopicTrendsArtifact;
  digestDay?: DigestDay;
  digestMarkdown?: string;
  cwd?: string;
}): void {
  const cwd = input.cwd ?? process.cwd();
  ensureNewsDir(cwd);

  fs.writeFileSync(resolveNewsBriefJsonPath(cwd), `${JSON.stringify(input.brief, null, 2)}\n`, "utf-8");
  fs.writeFileSync(resolveNewsScenarioJsonPath(cwd), `${JSON.stringify(input.scenarios, null, 2)}\n`, "utf-8");
  fs.writeFileSync(resolveNewsBriefMarkdownPath(cwd), input.briefMarkdown, "utf-8");
  fs.writeFileSync(resolveNewsScenarioMarkdownPath(cwd), input.scenarioMarkdown, "utf-8");

  if (input.trends) {
    fs.writeFileSync(resolveNewsTrendsJsonPath(cwd), `${JSON.stringify(input.trends, null, 2)}\n`, "utf-8");
  }
  if (input.digestDay) {
    fs.writeFileSync(resolveNewsDigestDayJsonPath(cwd), `${JSON.stringify(input.digestDay, null, 2)}\n`, "utf-8");
  }
  if (typeof input.digestMarkdown === "string") {
    fs.writeFileSync(resolveNewsDigestDayMarkdownPath(cwd), input.digestMarkdown, "utf-8");
  }
}
