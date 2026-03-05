import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  DailyDigestSchema,
  NewsItemSchema,
  RuntimeStateSchema,
  TopicDailyStatSchema,
  type DailyDigest,
  type NewsItem,
  type RuntimeState,
  type TopicDailyStat,
} from "../contracts";
import { DigestDaySchema, type DigestDay } from "../digest/contracts";
import { ScenarioPackSchema, type ScenarioPack } from "../scenario/contracts";
import { parseWithV3Whitelist } from "../../security/whitelist";
import { shiftKstDay } from "../trend";

const DEFAULT_ROOT = path.join(process.cwd(), ".data", "news");

const EMPTY_STATE: RuntimeState = {
  schemaVersion: 1,
  lastRunAt: undefined,
  sources: {},
};

export function resolveNewsRoot(rootDir = DEFAULT_ROOT): string {
  return rootDir;
}

export function resolveItemsDir(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveNewsRoot(rootDir), "items");
}

export function resolveStatePath(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveNewsRoot(rootDir), "state.json");
}

export function resolveDailyDir(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveNewsRoot(rootDir), "daily");
}

export function resolveCacheDir(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveNewsRoot(rootDir), "cache");
}

export function resolveDailyStatsPath(dateKst: string, rootDir = DEFAULT_ROOT): string {
  return path.join(resolveDailyDir(rootDir), `${dateKst}.json`);
}

export function resolveDigestPath(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveNewsRoot(rootDir), "digest.latest.json");
}

export function resolveTodayCachePath(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveCacheDir(rootDir), "today.latest.json");
}

export function resolveTrendsCachePath(windowDays: 7 | 30, rootDir = DEFAULT_ROOT): string {
  return path.join(resolveCacheDir(rootDir), `trends.${windowDays}d.latest.json`);
}

export function resolveScenariosCachePath(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveCacheDir(rootDir), "scenarios.latest.json");
}

function ensureStoreDirs(rootDir = DEFAULT_ROOT): void {
  fs.mkdirSync(resolveItemsDir(rootDir), { recursive: true });
  fs.mkdirSync(resolveDailyDir(rootDir), { recursive: true });
  fs.mkdirSync(resolveCacheDir(rootDir), { recursive: true });
}

function resolveItemPath(id: string, rootDir = DEFAULT_ROOT): string {
  return path.join(resolveItemsDir(rootDir), `${id}.json`);
}

export function hasItem(id: string, rootDir = DEFAULT_ROOT): boolean {
  const cleanId = id.trim();
  if (!cleanId) return false;
  return fs.existsSync(resolveItemPath(cleanId, rootDir));
}

export function readState(rootDir = DEFAULT_ROOT): RuntimeState {
  const filePath = resolveStatePath(rootDir);
  if (!fs.existsSync(filePath)) {
    return EMPTY_STATE;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return RuntimeStateSchema.parse(parsed);
  } catch {
    return EMPTY_STATE;
  }
}

export function writeState(state: RuntimeState, rootDir = DEFAULT_ROOT): void {
  ensureStoreDirs(rootDir);
  const validated = parseWithV3Whitelist(RuntimeStateSchema, {
    ...state,
    schemaVersion: 1,
  }, {
    scope: "persistence",
    context: "news.store.state",
  });
  fs.writeFileSync(resolveStatePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function upsertItems(items: NewsItem[], rootDir = DEFAULT_ROOT): { itemsNew: number; itemsDeduped: number } {
  ensureStoreDirs(rootDir);

  let itemsNew = 0;
  let itemsDeduped = 0;
  const seenIds = new Set<string>();

  for (const item of items) {
    const validated = parseWithV3Whitelist(NewsItemSchema, item, {
      scope: "persistence",
      context: "news.store.item",
    });
    if (seenIds.has(validated.id)) {
      itemsDeduped += 1;
      continue;
    }
    seenIds.add(validated.id);

    const filePath = resolveItemPath(validated.id, rootDir);
    const exists = fs.existsSync(filePath);
    if (exists) {
      itemsDeduped += 1;
    } else {
      itemsNew += 1;
    }

    fs.writeFileSync(filePath, `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
  }

  return { itemsNew, itemsDeduped };
}

export function readAllItems(rootDir = DEFAULT_ROOT): NewsItem[] {
  const itemsDir = resolveItemsDir(rootDir);
  if (!fs.existsSync(itemsDir)) return [];

  const files = fs.readdirSync(itemsDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const out: NewsItem[] = [];
  for (const name of files) {
    const filePath = path.join(itemsDir, name);
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
      out.push(NewsItemSchema.parse(parsed));
    } catch {
      // Skip broken rows silently for deterministic, non-blocking reads.
    }
  }
  return out;
}

export function writeDailyStats(dateKst: string, stats: TopicDailyStat[], rootDir = DEFAULT_ROOT): void {
  ensureStoreDirs(rootDir);
  const validated = stats.map((row) => parseWithV3Whitelist(TopicDailyStatSchema, row, {
    scope: "persistence",
    context: "news.store.daily",
  }));
  const filePath = resolveDailyStatsPath(dateKst, rootDir);
  fs.writeFileSync(filePath, `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function readDailyStats(dateKst: string, rootDir = DEFAULT_ROOT): TopicDailyStat[] {
  const filePath = resolveDailyStatsPath(dateKst, rootDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => TopicDailyStatSchema.parse(row));
  } catch {
    return [];
  }
}

export function readDailyStatsLastNDays(input: {
  toDateKst: string;
  days: number;
  rootDir?: string;
}): TopicDailyStat[] {
  const days = Math.max(1, Math.min(365, Math.round(input.days)));
  const out: TopicDailyStat[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftKstDay(input.toDateKst, -offset);
    out.push(...readDailyStats(day, input.rootDir));
  }
  return out;
}

export function writeDigest(digest: DailyDigest, rootDir = DEFAULT_ROOT): void {
  ensureStoreDirs(rootDir);
  const validated = parseWithV3Whitelist(DailyDigestSchema, {
    ...digest,
    schemaVersion: 1,
  }, {
    scope: "persistence",
    context: "news.store.digest",
  });
  fs.writeFileSync(resolveDigestPath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

const TrendCacheTopicSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  burstGrade: z.string().trim().min(1),
  sourceDiversity: z.number().finite().min(0).max(1),
});

export const TrendsCacheSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  generatedAt: z.string().datetime(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowDays: z.union([z.literal(7), z.literal(30)]),
  topics: z.array(TrendCacheTopicSchema),
});

export const TodayCacheSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  generatedAt: z.string().datetime(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lastRefreshedAt: z.string().datetime().nullable(),
  digest: DigestDaySchema,
  scenarios: ScenarioPackSchema,
});

export const ScenariosCacheSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  generatedAt: z.string().datetime(),
  lastRefreshedAt: z.string().datetime().nullable(),
  scenarios: ScenarioPackSchema,
});

export type TrendCacheTopic = z.infer<typeof TrendCacheTopicSchema>;
export type TrendsCache = z.infer<typeof TrendsCacheSchema>;
export type TodayCache = z.infer<typeof TodayCacheSchema>;
export type ScenariosCache = z.infer<typeof ScenariosCacheSchema>;

export function writeTodayCache(
  input: {
    generatedAt: string;
    date: string;
    lastRefreshedAt: string | null;
    digest: DigestDay;
    scenarios: ScenarioPack;
  },
  rootDir = DEFAULT_ROOT,
): void {
  ensureStoreDirs(rootDir);
  const validated = parseWithV3Whitelist(TodayCacheSchema, {
    schemaVersion: 1,
    ...input,
  }, {
    scope: "persistence",
    context: "news.store.cache.today",
  });
  fs.writeFileSync(resolveTodayCachePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function readTodayCache(rootDir = DEFAULT_ROOT): TodayCache | null {
  const filePath = resolveTodayCachePath(rootDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return TodayCacheSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function writeTrendsCache(
  input: {
    generatedAt: string;
    date: string;
    windowDays: 7 | 30;
    topics: TrendCacheTopic[];
  },
  rootDir = DEFAULT_ROOT,
): void {
  ensureStoreDirs(rootDir);
  const validated = parseWithV3Whitelist(TrendsCacheSchema, {
    schemaVersion: 1,
    ...input,
  }, {
    scope: "persistence",
    context: "news.store.cache.trends",
  });
  fs.writeFileSync(resolveTrendsCachePath(validated.windowDays, rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function readTrendsCache(windowDays: 7 | 30, rootDir = DEFAULT_ROOT): TrendsCache | null {
  const filePath = resolveTrendsCachePath(windowDays, rootDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return TrendsCacheSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function writeScenariosCache(
  input: {
    generatedAt: string;
    lastRefreshedAt: string | null;
    scenarios: ScenarioPack;
  },
  rootDir = DEFAULT_ROOT,
): void {
  ensureStoreDirs(rootDir);
  const validated = parseWithV3Whitelist(ScenariosCacheSchema, {
    schemaVersion: 1,
    ...input,
  }, {
    scope: "persistence",
    context: "news.store.cache.scenarios",
  });
  fs.writeFileSync(resolveScenariosCachePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function readScenariosCache(rootDir = DEFAULT_ROOT): ScenariosCache | null {
  const filePath = resolveScenariosCachePath(rootDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return ScenariosCacheSchema.parse(parsed);
  } catch {
    return null;
  }
}
