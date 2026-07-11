import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  IndicatorsStateSchema,
  ObservationSchema,
  SeriesSnapshotSchema,
  type SeriesFrequency,
  type IndicatorsState,
  type Observation,
  type SeriesSnapshot,
} from "../contracts";
import { normalizeSeriesId } from "../aliases";
import { parseWithV3Whitelist } from "../../security/whitelist";
import { resolveIndicatorsRootDir } from "../rootDir";
import {
  StorageCorruptedError,
  StorageUnavailableError,
} from "@/lib/planning/storage/serverFileRead";

const EMPTY_STATE: IndicatorsState = {
  schemaVersion: 1,
  lastRunAt: undefined,
  series: {},
};

export class IndicatorObservationConflictError extends Error {
  readonly seriesId: string;
  readonly periodKey: string;

  constructor(seriesId: string, periodKey: string) {
    super("indicator observation conflict: " + seriesId + "/" + periodKey);
    this.name = "IndicatorObservationConflictError";
    this.seriesId = seriesId;
    this.periodKey = periodKey;
  }
}

function defaultRootDir(): string {
  return resolveIndicatorsRootDir();
}

export function resolveIndicatorsRoot(rootDir = defaultRootDir()): string {
  return rootDir;
}

export function resolveSeriesDir(rootDir = defaultRootDir()): string {
  return path.join(resolveIndicatorsRoot(rootDir), "series");
}

export function resolveMetaDir(rootDir = defaultRootDir()): string {
  return path.join(resolveIndicatorsRoot(rootDir), "meta");
}

export function resolveStatePath(rootDir = defaultRootDir()): string {
  return path.join(resolveIndicatorsRoot(rootDir), "state.json");
}

export function resolveSeriesPath(seriesId: string, rootDir = defaultRootDir()): string {
  return path.join(resolveSeriesDir(rootDir), `${normalizeSeriesId(seriesId)}.jsonl`);
}

export function resolveMetaPath(seriesId: string, rootDir = defaultRootDir()): string {
  return path.join(resolveMetaDir(rootDir), `${normalizeSeriesId(seriesId)}.json`);
}

function ensureDirs(rootDir = defaultRootDir()): void {
  fs.mkdirSync(resolveSeriesDir(rootDir), { recursive: true });
  fs.mkdirSync(resolveMetaDir(rootDir), { recursive: true });
}

function observationPeriodKey(date: string, frequency: SeriesFrequency | undefined): string {
  if (frequency === "M") return date.slice(0, 7);
  if (frequency === "Q") {
    const quarter = /^(\d{4})(?:-Q([1-4])|-(\d{2}))/.exec(date);
    if (!quarter) return date;
    const quarterNumber = quarter[2]
      ? Number(quarter[2])
      : Math.floor((Number(quarter[3]) - 1) / 3) + 1;
    return quarter[1] + "-Q" + String(quarterNumber);
  }
  if (frequency === "Y") return date.slice(0, 4);
  return date;
}

function assertSameObservationValue(
  seriesId: string,
  periodKey: string,
  left: Observation,
  right: Observation,
): void {
  if (Object.is(left.value, right.value)) return;
  throw new IndicatorObservationConflictError(seriesId, periodKey);
}

export function readState(rootDir = defaultRootDir()): IndicatorsState {
  const filePath = resolveStatePath(rootDir);
  if (!fs.existsSync(filePath)) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return IndicatorsStateSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new StorageCorruptedError("indicator state is malformed", {
        filePath,
        cause: error,
      });
    }
    throw new StorageUnavailableError("indicator state is unavailable", {
      filePath,
      cause: error,
    });
  }
}

export function writeState(state: IndicatorsState, rootDir = defaultRootDir()): void {
  ensureDirs(rootDir);
  const validated = parseWithV3Whitelist(IndicatorsStateSchema, {
    schemaVersion: 1,
    ...state,
  }, {
    scope: "persistence",
    context: "indicators.store.state",
  });
  fs.writeFileSync(resolveStatePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}

export function readSeriesObservations(seriesId: string, rootDir = defaultRootDir()): Observation[] {
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

export function appendSeriesObservations(
  seriesId: string,
  observations: Observation[],
  rootDir = defaultRootDir(),
  options: { frequency?: SeriesFrequency } = {},
): {
  appended: number;
  skippedDuplicate: number;
  total: number;
  lastObservationDate?: string;
} {
  ensureDirs(rootDir);

  const normalizedSeriesId = normalizeSeriesId(seriesId);
  const existing = readSeriesObservations(normalizedSeriesId, rootDir);
  const existingByPeriod = new Map<string, Observation>();
  for (const row of existing) {
    const periodKey = observationPeriodKey(row.date, options.frequency);
    const previous = existingByPeriod.get(periodKey);
    if (previous) {
      assertSameObservationValue(normalizedSeriesId, periodKey, previous, row);
      continue;
    }
    existingByPeriod.set(periodKey, row);
  }
  const incoming = observations.map((row) => parseWithV3Whitelist(ObservationSchema, row, {
    scope: "persistence",
    context: "indicators.store.observation",
  }));

  const dedupedIncoming = new Map<string, Observation>();
  for (const row of incoming) {
    const periodKey = observationPeriodKey(row.date, options.frequency);
    const previous = dedupedIncoming.get(periodKey);
    if (previous) {
      assertSameObservationValue(normalizedSeriesId, periodKey, previous, row);
      continue;
    }
    dedupedIncoming.set(periodKey, row);
  }

  const rowsToAppend = Array.from(dedupedIncoming.values())
    .filter((row) => {
      const periodKey = observationPeriodKey(row.date, options.frequency);
      const previous = existingByPeriod.get(periodKey);
      if (!previous) return true;
      assertSameObservationValue(normalizedSeriesId, periodKey, previous, row);
      return false;
    })
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

export function writeSeriesMeta(snapshot: SeriesSnapshot, rootDir = defaultRootDir()): void {
  ensureDirs(rootDir);
  const validated = parseWithV3Whitelist(SeriesSnapshotSchema, snapshot, {
    scope: "persistence",
    context: "indicators.store.meta",
  });
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
  const safeOut = parseWithV3Whitelist(SeriesSnapshotSchema.pick({
    seriesId: true,
    asOf: true,
    meta: true,
  }).extend({
    observations: z.object({
      count: z.number().int().nonnegative(),
      firstDate: z.string().nullable().optional(),
      lastDate: z.string().nullable().optional(),
    }),
  }), out, {
    scope: "persistence",
    context: "indicators.store.meta.summary",
  });
  fs.writeFileSync(resolveMetaPath(normalizeSeriesId(validated.seriesId), rootDir), `${JSON.stringify(safeOut, null, 2)}\n`, "utf-8");
}
