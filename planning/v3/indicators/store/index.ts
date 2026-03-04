import fs from "node:fs";
import path from "node:path";
import {
  IndicatorsStateSchema,
  ObservationSchema,
  SeriesSnapshotSchema,
  type IndicatorsState,
  type Observation,
  type SeriesSnapshot,
} from "../contracts";
import { normalizeSeriesId } from "../aliases";

const DEFAULT_ROOT = path.join(process.cwd(), ".data", "indicators");

const EMPTY_STATE: IndicatorsState = {
  lastRunAt: undefined,
  series: {},
};

export function resolveIndicatorsRoot(rootDir = DEFAULT_ROOT): string {
  return rootDir;
}

export function resolveSeriesDir(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveIndicatorsRoot(rootDir), "series");
}

export function resolveMetaDir(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveIndicatorsRoot(rootDir), "meta");
}

export function resolveStatePath(rootDir = DEFAULT_ROOT): string {
  return path.join(resolveIndicatorsRoot(rootDir), "state.json");
}

export function resolveSeriesPath(seriesId: string, rootDir = DEFAULT_ROOT): string {
  return path.join(resolveSeriesDir(rootDir), `${normalizeSeriesId(seriesId)}.jsonl`);
}

export function resolveMetaPath(seriesId: string, rootDir = DEFAULT_ROOT): string {
  return path.join(resolveMetaDir(rootDir), `${normalizeSeriesId(seriesId)}.json`);
}

function ensureDirs(rootDir = DEFAULT_ROOT): void {
  fs.mkdirSync(resolveSeriesDir(rootDir), { recursive: true });
  fs.mkdirSync(resolveMetaDir(rootDir), { recursive: true });
}

export function readState(rootDir = DEFAULT_ROOT): IndicatorsState {
  const filePath = resolveStatePath(rootDir);
  if (!fs.existsSync(filePath)) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return IndicatorsStateSchema.parse(parsed);
  } catch {
    return EMPTY_STATE;
  }
}

export function writeState(state: IndicatorsState, rootDir = DEFAULT_ROOT): void {
  ensureDirs(rootDir);
  const validated = IndicatorsStateSchema.parse(state);
  fs.writeFileSync(resolveStatePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function readSeriesObservations(seriesId: string, rootDir = DEFAULT_ROOT): Observation[] {
  const normalizedSeriesId = normalizeSeriesId(seriesId);
  const filePath = resolveSeriesPath(normalizedSeriesId, rootDir);
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const out: Observation[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      out.push(ObservationSchema.parse(parsed));
    } catch {
      // Ignore malformed rows to keep reads non-blocking.
    }
  }

  return out;
}

export function appendSeriesObservations(seriesId: string, observations: Observation[], rootDir = DEFAULT_ROOT): {
  appended: number;
  skippedDuplicate: number;
  total: number;
  lastObservationDate?: string;
} {
  ensureDirs(rootDir);

  const normalizedSeriesId = normalizeSeriesId(seriesId);
  const existing = readSeriesObservations(normalizedSeriesId, rootDir);
  const existingDates = new Set(existing.map((row) => row.date));
  const incoming = observations.map((row) => ObservationSchema.parse(row));

  const dedupedIncoming = new Map<string, Observation>();
  for (const row of incoming) {
    if (!dedupedIncoming.has(row.date)) {
      dedupedIncoming.set(row.date, row);
    }
  }

  const rowsToAppend = Array.from(dedupedIncoming.values())
    .filter((row) => !existingDates.has(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const filePath = resolveSeriesPath(normalizedSeriesId, rootDir);
  if (rowsToAppend.length > 0) {
    const payload = rowsToAppend.map((row) => JSON.stringify(row)).join("\n");
    const prefix = fs.existsSync(filePath) && fs.statSync(filePath).size > 0 ? "\n" : "";
    fs.appendFileSync(filePath, `${prefix}${payload}`);
  }

  const appended = rowsToAppend.length;
  const skippedDuplicate = incoming.length - appended;
  const total = existing.length + appended;
  const lastObservationDate = [...existing, ...rowsToAppend].map((row) => row.date).sort((a, b) => a.localeCompare(b)).at(-1);

  return {
    appended,
    skippedDuplicate,
    total,
    lastObservationDate,
  };
}

export function writeSeriesMeta(snapshot: SeriesSnapshot, rootDir = DEFAULT_ROOT): void {
  ensureDirs(rootDir);
  const validated = SeriesSnapshotSchema.parse(snapshot);
  const out = {
    seriesId: validated.seriesId,
    asOf: validated.asOf,
    meta: validated.meta,
    observations: {
      count: validated.observations.length,
      firstDate: validated.observations.map((row) => row.date).sort((a, b) => a.localeCompare(b)).at(0),
      lastDate: validated.observations.map((row) => row.date).sort((a, b) => a.localeCompare(b)).at(-1),
    },
  };
  fs.writeFileSync(resolveMetaPath(normalizeSeriesId(validated.seriesId), rootDir), `${JSON.stringify(out, null, 2)}\n`, "utf-8");
}
