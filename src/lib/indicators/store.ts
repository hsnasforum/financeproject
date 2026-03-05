import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "../planning/storage/dataDir.ts";
import { ObservationSchema, SeriesSnapshotSchema } from "./contracts.ts";
import { type Observation, type SeriesSnapshot, type SeriesSpec } from "./types.ts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonLine(line: string): Observation | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return ObservationSchema.parse(JSON.parse(trimmed) as unknown);
  } catch {
    return null;
  }
}

export function resolveIndicatorsRoot(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "indicators");
}

export function resolveIndicatorsSeriesDir(rootDir = resolveIndicatorsRoot()): string {
  return path.join(rootDir, "series");
}

export function resolveSeriesPath(seriesId: string, rootDir = resolveIndicatorsRoot()): string {
  return path.join(resolveIndicatorsSeriesDir(rootDir), `${seriesId}.jsonl`);
}

function ensureStoreDir(rootDir = resolveIndicatorsRoot()): void {
  fs.mkdirSync(resolveIndicatorsSeriesDir(rootDir), { recursive: true });
}

export function readSeriesObservations(seriesId: string, rootDir = resolveIndicatorsRoot()): Observation[] {
  const safeSeriesId = asString(seriesId);
  if (!safeSeriesId) return [];

  const filePath = resolveSeriesPath(safeSeriesId, rootDir);
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const byDate = new Map<string, Observation>();
  for (const line of lines) {
    const parsed = parseJsonLine(line);
    if (!parsed) continue;
    byDate.set(parsed.date, parsed);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function appendSeriesObservations(
  seriesId: string,
  observations: Observation[],
  rootDir = resolveIndicatorsRoot(),
): { appended: number; total: number } {
  const safeSeriesId = asString(seriesId);
  if (!safeSeriesId) return { appended: 0, total: 0 };

  ensureStoreDir(rootDir);
  const existing = readSeriesObservations(safeSeriesId, rootDir);
  const existingDates = new Set(existing.map((row) => row.date));
  const nextRows: Observation[] = [];

  const sortedIncoming = observations
    .map((row) => ObservationSchema.parse(row))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const row of sortedIncoming) {
    if (existingDates.has(row.date)) continue;
    existingDates.add(row.date);
    nextRows.push(row);
  }

  if (nextRows.length > 0) {
    const payload = nextRows.map((row) => JSON.stringify(row)).join("\n");
    fs.appendFileSync(resolveSeriesPath(safeSeriesId, rootDir), `${payload}\n`, "utf-8");
  }

  return {
    appended: nextRows.length,
    total: existing.length + nextRows.length,
  };
}

export function readSeriesSnapshot(spec: SeriesSpec, rootDir = resolveIndicatorsRoot()): SeriesSnapshot {
  const observations = readSeriesObservations(spec.id, rootDir);
  const asOf = new Date().toISOString();
  const latestDate = observations[observations.length - 1]?.date;

  return SeriesSnapshotSchema.parse({
    seriesId: spec.id,
    asOf,
    observations,
    meta: {
      sourceId: spec.sourceId,
      externalId: spec.externalId,
      frequency: spec.frequency,
      units: spec.units,
      transform: spec.transform ?? "none",
      lastUpdatedAt: latestDate ? new Date(`${latestDate}T00:00:00.000Z`).toISOString() : asOf,
      observationCount: observations.length,
    },
  });
}
