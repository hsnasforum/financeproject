import fs from "node:fs";
import path from "node:path";
import { parseIndicatorSeriesFile } from "./contracts";
import { type SeriesSnapshot } from "./types";
import { readSeriesObservations, resolveIndicatorsRoot } from "./store";

export type IndicatorView = "last" | "pctChange" | "zscore";

export type IndicatorQueryStatus = "ok" | "unknown";

export type IndicatorQueryResult = {
  seriesId: string;
  view: IndicatorView;
  window: number;
  status: IndicatorQueryStatus;
  valueSummary: string;
  asOf: string | null;
};

type IndicatorWatchSpec = {
  label: string;
  seriesId: string;
  view: IndicatorView;
  window: number;
};

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

function formatSigned(value: number): string {
  const rounded = round2(value);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function resolveIndicatorsSeriesConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, "config", "indicators-series.json");
}

function readSeriesSpecs(cwd = process.cwd()) {
  const filePath = resolveIndicatorsSeriesConfigPath(cwd);
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    const file = parseIndicatorSeriesFile(parsed);
    return file.series;
  } catch {
    return [];
  }
}

export function hasSeriesSpec(seriesId: string, cwd = process.cwd()): boolean {
  return readSeriesSpecs(cwd).some((row) => row.id === seriesId);
}

function unknownResult(seriesId: string, view: IndicatorView, window: number): IndicatorQueryResult {
  return {
    seriesId,
    view,
    window,
    status: "unknown",
    valueSummary: "데이터 부족",
    asOf: null,
  };
}

function zScore(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((acc, row) => acc + row, 0) / values.length;
  const variance = values.reduce((acc, row) => {
    const diff = row - mean;
    return acc + diff * diff;
  }, 0) / values.length;
  const stddev = Math.sqrt(variance);
  if (!Number.isFinite(stddev) || stddev <= 0) return null;
  const latest = values[values.length - 1] ?? NaN;
  if (!Number.isFinite(latest)) return null;
  return (latest - mean) / stddev;
}

export function queryIndicatorSeries(input: {
  seriesId: string;
  view: IndicatorView;
  window?: number;
  cwd?: string;
}): IndicatorQueryResult {
  const cwd = input.cwd ?? process.cwd();
  const seriesId = asString(input.seriesId);
  const view = input.view;
  const window = Math.max(1, Math.min(365, Math.round(asNumber(input.window, 3))));
  if (!seriesId) return unknownResult("", view, window);
  if (!hasSeriesSpec(seriesId, cwd)) return unknownResult(seriesId, view, window);

  const observations = readSeriesObservations(seriesId, resolveIndicatorsRoot(cwd));
  if (observations.length < 1) return unknownResult(seriesId, view, window);

  const latest = observations[observations.length - 1];
  if (!latest) return unknownResult(seriesId, view, window);

  if (view === "last") {
    return {
      seriesId,
      view,
      window,
      status: "ok",
      valueSummary: `${round2(latest.value)} (${latest.date})`,
      asOf: latest.date,
    };
  }

  if (view === "pctChange") {
    const baseIndex = observations.length - 1 - window;
    const base = observations[baseIndex];
    if (!base || !Number.isFinite(base.value) || base.value === 0) {
      return unknownResult(seriesId, view, window);
    }
    const change = ((latest.value - base.value) / Math.abs(base.value)) * 100;
    return {
      seriesId,
      view,
      window,
      status: "ok",
      valueSummary: `${formatSigned(change)}% (${window}p, ${latest.date})`,
      asOf: latest.date,
    };
  }

  const start = Math.max(0, observations.length - window);
  const values = observations.slice(start).map((row) => row.value);
  const score = zScore(values);
  if (score === null || !Number.isFinite(score)) return unknownResult(seriesId, view, window);
  const grade = score >= 2 ? "상" : score >= 1 ? "중" : "하";

  return {
    seriesId,
    view,
    window,
    status: "ok",
    valueSummary: `${formatSigned(score)}σ (${grade}, ${latest.date})`,
    asOf: latest.date,
  };
}

export function buildWatchlistValues(input: {
  specs: IndicatorWatchSpec[];
  cwd?: string;
}): Array<IndicatorWatchSpec & { status: IndicatorQueryStatus; valueSummary: string; asOf: string | null }> {
  return input.specs.map((spec) => {
    const result = queryIndicatorSeries({
      seriesId: spec.seriesId,
      view: spec.view,
      window: spec.window,
      cwd: input.cwd,
    });

    return {
      label: asString(spec.label),
      seriesId: asString(spec.seriesId),
      view: spec.view,
      window: Math.max(1, Math.round(asNumber(spec.window, 1))),
      status: result.status,
      valueSummary: result.valueSummary,
      asOf: result.asOf,
    };
  });
}

export function readIndicatorSeriesSnapshots(input: {
  cwd?: string;
  seriesIds?: string[];
} = {}): SeriesSnapshot[] {
  const cwd = input.cwd ?? process.cwd();
  const rootDir = resolveIndicatorsRoot(cwd);
  const allowlist = input.seriesIds
    ? new Set(input.seriesIds.map((row) => asString(row)).filter(Boolean))
    : null;

  return readSeriesSpecs(cwd)
    .filter((spec) => !allowlist || allowlist.has(spec.id))
    .map((spec) => {
      const observations = readSeriesObservations(spec.id, rootDir);
      const lastDate = observations[observations.length - 1]?.date ?? null;
      return {
        seriesId: spec.id,
        asOf: lastDate ? new Date(`${lastDate}T00:00:00.000Z`).toISOString() : new Date().toISOString(),
        observations,
        meta: {
          sourceId: spec.sourceId,
          externalId: spec.externalId,
          frequency: spec.frequency,
          units: spec.units,
          transform: spec.transform ?? "none",
          lastUpdatedAt: lastDate ? new Date(`${lastDate}T00:00:00.000Z`).toISOString() : new Date().toISOString(),
          observationCount: observations.length,
        },
      } satisfies SeriesSnapshot;
    });
}
