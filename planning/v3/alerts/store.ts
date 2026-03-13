import fs from "node:fs";
import path from "node:path";
import { AlertEventSchema, type AlertEvent } from "./contracts";
import { resolveAlertsRootDir } from "./rootDir";
import { parseWithV3Whitelist } from "../security/whitelist";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultRootDir(): string {
  return resolveAlertsRootDir();
}

export function resolveAlertsDataDir(rootDir = defaultRootDir()): string {
  return rootDir;
}

export function resolveAlertEventsPath(rootDir = defaultRootDir()): string {
  return path.join(resolveAlertsDataDir(rootDir), "events.jsonl");
}

function ensureDir(rootDir = defaultRootDir()): void {
  fs.mkdirSync(resolveAlertsDataDir(rootDir), { recursive: true });
}

function readLine(line: string): AlertEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return AlertEventSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function readAlertEvents(rootDir = defaultRootDir()): AlertEvent[] {
  const filePath = resolveAlertEventsPath(rootDir);
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const out: AlertEvent[] = [];
  for (const line of lines) {
    const row = readLine(line);
    if (row) out.push(row);
  }

  out.sort((a, b) => {
    const left = Date.parse(a.createdAt);
    const right = Date.parse(b.createdAt);
    if (left !== right) return right - left;
    return b.id.localeCompare(a.id);
  });

  return out;
}

function dedupKey(event: AlertEvent): string {
  return [event.ruleId, event.ruleKind, event.targetType, event.targetId, event.level].join("|");
}

export function appendAlertEvents(input: {
  events: AlertEvent[];
  rootDir?: string;
  dedupWindowMinutes?: number;
}): { appended: number; skippedDuplicate: number; total: number } {
  const rootDir = input.rootDir ?? defaultRootDir();
  const dedupWindowMinutes = Math.max(1, Math.min(24 * 60, Math.round(asNumber(input.dedupWindowMinutes, 180))));
  const dedupWindowMs = dedupWindowMinutes * 60 * 1000;

  if (input.events.length < 1) {
    return {
      appended: 0,
      skippedDuplicate: 0,
      total: readAlertEvents(rootDir).length,
    };
  }

  ensureDir(rootDir);

  const existing = readAlertEvents(rootDir);
  const existingIds = new Set(existing.map((row) => row.id));
  const latestByKey = new Map<string, number>();
  for (const row of existing) {
    const ts = Date.parse(row.createdAt);
    if (!Number.isFinite(ts)) continue;
    const key = dedupKey(row);
    const prev = latestByKey.get(key);
    if (typeof prev !== "number" || ts > prev) {
      latestByKey.set(key, ts);
    }
  }

  const rows = input.events
    .map((row) => parseWithV3Whitelist(AlertEventSchema, row, {
      scope: "persistence",
      context: "alerts.store.event",
    }))
    .sort((a, b) => {
      const left = Date.parse(a.createdAt);
      const right = Date.parse(b.createdAt);
      if (left !== right) return left - right;
      return a.id.localeCompare(b.id);
    });

  const rowsToAppend: AlertEvent[] = [];
  let skippedDuplicate = 0;

  for (const row of rows) {
    if (existingIds.has(row.id)) {
      skippedDuplicate += 1;
      continue;
    }

    const ts = Date.parse(row.createdAt);
    const key = dedupKey(row);
    const latestTs = latestByKey.get(key);
    if (Number.isFinite(ts) && typeof latestTs === "number" && Math.abs(ts - latestTs) <= dedupWindowMs) {
      skippedDuplicate += 1;
      continue;
    }

    rowsToAppend.push(row);
    existingIds.add(row.id);
    if (Number.isFinite(ts)) latestByKey.set(key, ts);
  }

  if (rowsToAppend.length > 0) {
    const payload = rowsToAppend.map((row) => JSON.stringify(row)).join("\n");
    const filePath = resolveAlertEventsPath(rootDir);
    fs.appendFileSync(filePath, `${payload}\n`, "utf-8");
  }

  return {
    appended: rowsToAppend.length,
    skippedDuplicate,
    total: existing.length + rowsToAppend.length,
  };
}

function formatKstDay(isoLike: string): string {
  const parsed = Date.parse(asString(isoLike));
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((row) => row.type === "year")?.value ?? "0000";
  const month = parts.find((row) => row.type === "month")?.value ?? "01";
  const day = parts.find((row) => row.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function shiftKstDay(dayKst: string, deltaDays: number): string {
  const [year, month, day] = dayKst.split("-").map((token) => Number(token));
  const utc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const shifted = new Date(utc + (deltaDays * 24 * 60 * 60 * 1000));
  const yyyy = String(shifted.getUTCFullYear());
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function readRecentAlertEvents(input: {
  rootDir?: string;
  days?: number;
  nowIso?: string;
} = {}): AlertEvent[] {
  const rootDir = input.rootDir ?? defaultRootDir();
  const days = Math.max(1, Math.min(90, Math.round(asNumber(input.days, 14))));
  const nowIso = asString(input.nowIso) || new Date().toISOString();
  const todayKst = formatKstDay(nowIso);
  const fromKst = shiftKstDay(todayKst, -(days - 1));

  return readAlertEvents(rootDir)
    .filter((row) => row.dayKst >= fromKst && row.dayKst <= todayKst);
}

export function groupAlertEventsByDay(events: AlertEvent[]): Array<{ dayKst: string; events: AlertEvent[] }> {
  const byDay = new Map<string, AlertEvent[]>();
  for (const row of events) {
    const bucket = byDay.get(row.dayKst) ?? [];
    bucket.push(row);
    byDay.set(row.dayKst, bucket);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKst, rows]) => ({
      dayKst,
      events: rows.sort((left, right) => {
        const l = Date.parse(left.createdAt);
        const r = Date.parse(right.createdAt);
        if (l !== r) return r - l;
        return right.id.localeCompare(left.id);
      }),
    }));
}
