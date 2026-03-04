import fs from "node:fs";
import path from "node:path";
import {
  parseIndicatorSeriesFile,
  parseIndicatorSourcesFile,
  parseIndicatorsRefreshResult,
} from "./contracts";
import { fetchEcosSeries } from "./connectors/ecos";
import { readIndicatorsState, writeIndicatorsState } from "./state";
import { appendSeriesObservations, resolveIndicatorsRoot } from "./store";
import {
  type IndicatorConnector,
  type IndicatorSeriesFile,
  type IndicatorsRefreshError,
  type IndicatorsRefreshResult,
  type IndicatorSource,
  type IndicatorSourcesFile,
  type Observation,
  type SeriesSpec,
} from "./types";

const SOURCES_CONFIG_RELATIVE = path.join("config", "indicators-sources.json");
const SERIES_CONFIG_RELATIVE = path.join("config", "indicators-series.json");

type RunIndicatorsRefreshOptions = {
  cwd?: string;
  rootDir?: string;
  dry?: boolean;
  now?: Date;
  fetchImpl?: typeof fetch;
  connectors?: Partial<Record<IndicatorSource["type"], IndicatorConnector>>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as unknown;
}

function loadSourcesConfig(cwd: string): IndicatorSourcesFile {
  const filePath = path.join(cwd, SOURCES_CONFIG_RELATIVE);
  return parseIndicatorSourcesFile(readJson(filePath));
}

function loadSeriesConfig(cwd: string): IndicatorSeriesFile {
  const filePath = path.join(cwd, SERIES_CONFIG_RELATIVE);
  return parseIndicatorSeriesFile(readJson(filePath));
}

function daysAgo(base: Date, dayOffset: number): string {
  const at = new Date(base.getTime() - (dayOffset * 24 * 60 * 60 * 1000));
  return at.toISOString().slice(0, 10);
}

function monthsAgo(base: Date, monthOffset: number): string {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const shifted = new Date(Date.UTC(year, month - monthOffset, 1));
  return shifted.toISOString().slice(0, 10);
}

function quartersAgo(base: Date, quarterOffset: number): string {
  const year = base.getUTCFullYear();
  const month = Math.floor(base.getUTCMonth() / 3) * 3;
  const shifted = new Date(Date.UTC(year, month - (quarterOffset * 3), 1));
  return shifted.toISOString().slice(0, 10);
}

function yearsAgo(base: Date, yearOffset: number): string {
  const shifted = new Date(Date.UTC(base.getUTCFullYear() - yearOffset, 0, 1));
  return shifted.toISOString().slice(0, 10);
}

function hashSeed(input: string): number {
  let seed = 0;
  for (let i = 0; i < input.length; i += 1) {
    seed = (seed * 31 + input.charCodeAt(i)) % 100000;
  }
  return seed;
}

function dryObservations(spec: SeriesSpec, now: Date): Observation[] {
  const seed = hashSeed(spec.id);
  const count = spec.frequency === "D"
    ? 30
    : spec.frequency === "W"
      ? 30
      : spec.frequency === "M"
        ? 24
        : spec.frequency === "Q"
          ? 16
          : 12;

  const out: Observation[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = spec.frequency === "D"
      ? daysAgo(now, i)
      : spec.frequency === "W"
        ? daysAgo(now, i * 7)
        : spec.frequency === "M"
          ? monthsAgo(now, i)
          : spec.frequency === "Q"
            ? quartersAgo(now, i)
            : yearsAgo(now, i);
    const value = Number(((seed % 300) / 10 + (count - i) * 0.17).toFixed(4));
    out.push({ date, value });
  }
  return out;
}

function pushError(errors: IndicatorsRefreshError[], row: IndicatorsRefreshError): void {
  errors.push({
    sourceId: asString(row.sourceId),
    seriesId: asString(row.seriesId) || undefined,
    code: asString(row.code) || "UNKNOWN",
    message: asString(row.message) || "unknown_error",
  });
}

const DEFAULT_CONNECTORS: Partial<Record<IndicatorSource["type"], IndicatorConnector>> = {
  ecos: {
    fetchSeries: async (input) => fetchEcosSeries({
      externalId: input.spec.externalId,
      fetchImpl: input.fetchImpl,
    }),
  },
};

export async function runIndicatorsRefresh(options: RunIndicatorsRefreshOptions = {}): Promise<IndicatorsRefreshResult> {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const rootDir = options.rootDir ?? resolveIndicatorsRoot(cwd);
  const dry = options.dry === true;

  const sourcesConfig = loadSourcesConfig(cwd);
  const seriesConfig = loadSeriesConfig(cwd);
  const enabledSources = sourcesConfig.sources.filter((row) => row.enabled);
  const connectors = {
    ...DEFAULT_CONNECTORS,
    ...(options.connectors ?? {}),
  };

  const state = readIndicatorsState(rootDir);
  const nextState = {
    ...state,
    sources: { ...state.sources },
  };

  let seriesProcessed = 0;
  let seriesUpdated = 0;
  let observationsAppended = 0;
  const errors: IndicatorsRefreshError[] = [];

  for (const source of enabledSources) {
    const sourceSeries = seriesConfig.series.filter((row) => row.sourceId === source.id);
    for (const spec of sourceSeries) {
      seriesProcessed += 1;
      try {
        let asOf = generatedAt;
        let observations: Observation[] = [];
        let etag: string | undefined;
        let lastModified: string | undefined;
        let cursor: string | undefined;

        if (dry) {
          observations = dryObservations(spec, now);
        } else {
          const connector = connectors[source.type];
          if (!connector) {
            throw new Error(`CONNECTOR_NOT_IMPLEMENTED:${source.type}`);
          }
          const fetched = await connector.fetchSeries({
            source,
            spec,
            previousState: nextState.sources[source.id],
            now,
            fetchImpl: options.fetchImpl,
          });
          asOf = asString(fetched.asOf) || generatedAt;
          observations = fetched.observations;
          etag = asString(fetched.etag) || undefined;
          lastModified = asString(fetched.lastModified) || undefined;
          cursor = asString(fetched.cursor) || undefined;
        }

        const persisted = appendSeriesObservations(spec.id, observations, rootDir);
        observationsAppended += persisted.appended;
        if (persisted.appended > 0) seriesUpdated += 1;

        nextState.sources[source.id] = {
          ...nextState.sources[source.id],
          ...(etag ? { etag } : {}),
          ...(lastModified ? { lastModified } : {}),
          ...(cursor ? { cursor } : {}),
          lastRunAt: asOf,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        const [codePrefix, ...rest] = message.split(":");
        const code = rest.length > 0 ? codePrefix : "FETCH_FAILED";
        pushError(errors, {
          sourceId: source.id,
          seriesId: spec.id,
          code,
          message: rest.length > 0 ? rest.join(":").trim() || message : message,
        });
      }
    }
  }

  nextState.lastRunAt = generatedAt;
  writeIndicatorsState(nextState, rootDir);

  return parseIndicatorsRefreshResult({
    generatedAt,
    sourcesProcessed: enabledSources.length,
    seriesProcessed,
    seriesUpdated,
    observationsAppended,
    errors,
  });
}
