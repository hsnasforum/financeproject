import fs from "node:fs";
import path from "node:path";
import {
  NewsItemSchema,
  RuntimeStateSchema,
  type NewsItem,
  type RuntimeState,
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

function ensureStoreDirs(rootDir = DEFAULT_ROOT): void {
  fs.mkdirSync(resolveItemsDir(rootDir), { recursive: true });
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
