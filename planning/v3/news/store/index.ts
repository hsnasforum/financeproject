import fs from "node:fs";
import path from "node:path";
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

const DEFAULT_ROOT = path.join(process.cwd(), ".data", "news");

const EMPTY_STATE: RuntimeState = {
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

export function resolveDailyStatsPath(dateKst: string, rootDir = DEFAULT_ROOT): string {
  return path.join(resolveDailyDir(rootDir), `${dateKst}.json`);
}

export function resolveDigestPath(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveNewsRoot(rootDir), "digest.latest.json");
}

function ensureStoreDirs(rootDir = DEFAULT_ROOT): void {
  fs.mkdirSync(resolveItemsDir(rootDir), { recursive: true });
  fs.mkdirSync(resolveDailyDir(rootDir), { recursive: true });
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
  const validated = RuntimeStateSchema.parse(state);
  fs.writeFileSync(resolveStatePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function upsertItems(items: NewsItem[], rootDir = DEFAULT_ROOT): { itemsNew: number; itemsDeduped: number } {
  ensureStoreDirs(rootDir);

  let itemsNew = 0;
  let itemsDeduped = 0;
  const seenIds = new Set<string>();

  for (const item of items) {
    const validated = NewsItemSchema.parse(item);
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
  const validated = stats.map((row) => TopicDailyStatSchema.parse(row));
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

export function writeDigest(digest: DailyDigest, rootDir = DEFAULT_ROOT): void {
  ensureStoreDirs(rootDir);
  const validated = DailyDigestSchema.parse(digest);
  fs.writeFileSync(resolveDigestPath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}
