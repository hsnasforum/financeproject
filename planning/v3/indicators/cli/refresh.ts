import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RefreshResultSchema,
  SeriesSnapshotSchema,
  type IndicatorSource,
  type RefreshResult,
  type SeriesSpec,
} from "../contracts";
import { getConnector } from "../connectors/registry";
import { normalizeConnectorError, shouldRetryConnectorError, toRefreshError } from "../connectors/errors";
import type { ConnectorSeriesResult, SeriesConnector } from "../connectors/types";
import { INDICATOR_SERIES_SPECS, INDICATOR_SOURCES } from "../specs";
import { appendSeriesObservations, readState, writeSeriesMeta, writeState } from "../store";

type RetryPolicy = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

type ResolvedRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
};

type RunIndicatorsRefreshOptions = {
  rootDir?: string;
  sources?: IndicatorSource[];
  specs?: SeriesSpec[];
  now?: Date;
  retry?: RetryPolicy;
  connectorResolver?: (source: IndicatorSource) => SeriesConnector;
};

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRetryPolicy(retry: RetryPolicy | undefined): ResolvedRetryPolicy {
  const maxAttempts = Number.isFinite(retry?.maxAttempts) ? Math.max(1, Math.floor(retry?.maxAttempts ?? 1)) : 2;
  const baseDelayMs = Number.isFinite(retry?.baseDelayMs) ? Math.max(0, Math.floor(retry?.baseDelayMs ?? 0)) : 25;

  return {
    maxAttempts,
    baseDelayMs,
    sleep: retry?.sleep ?? defaultSleep,
  };
}

function uniqueSources(specs: SeriesSpec[]): Set<string> {
  return new Set(specs.map((row) => row.sourceId));
}

async function fetchWithRetry(
  connector: SeriesConnector,
  spec: SeriesSpec,
  now: Date,
  retryPolicy: ResolvedRetryPolicy,
): Promise<ConnectorSeriesResult> {
  let lastError: ReturnType<typeof normalizeConnectorError> | null = null;

  for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
    try {
      return await connector.fetchSeries(spec, {
        asOf: now,
        attempt,
        maxAttempts: retryPolicy.maxAttempts,
      });
    } catch (error) {
      const normalized = normalizeConnectorError(error);
      lastError = normalized;

      const isRetryable = shouldRetryConnectorError(normalized);
      const isLastAttempt = attempt >= retryPolicy.maxAttempts;
      if (!isRetryable || isLastAttempt) {
        throw normalized;
      }

      const backoffMs = retryPolicy.baseDelayMs * attempt;
      await retryPolicy.sleep(backoffMs);
    }
  }

  throw lastError ?? normalizeConnectorError("unknown_error");
}

export async function runIndicatorsRefresh(options: RunIndicatorsRefreshOptions = {}): Promise<RefreshResult> {
  const now = options.now ?? new Date();
  const retryPolicy = resolveRetryPolicy(options.retry);
  const sources = (options.sources ?? INDICATOR_SOURCES).filter((source) => source.enabled);
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const specs = (options.specs ?? INDICATOR_SERIES_SPECS).filter((spec) => spec.enabled !== false);

  const state = readState(options.rootDir);
  const nextState = {
    ...state,
    series: { ...state.series },
  };

  let seriesProcessed = 0;
  let seriesUpdated = 0;
  let observationsAppended = 0;
  const errors: RefreshResult["errors"] = [];

  for (const spec of specs) {
    const source = sourceMap.get(spec.sourceId);
    if (!source) {
      errors.push({
        sourceId: spec.sourceId,
        seriesId: spec.id,
        code: "INPUT",
        message: `enabled source not found: ${spec.sourceId}`,
      });
      continue;
    }

    seriesProcessed += 1;

    try {
      const connector = options.connectorResolver ? options.connectorResolver(source) : getConnector(source);
      const fetched = await fetchWithRetry(connector, spec, now, retryPolicy);

      const snapshot = SeriesSnapshotSchema.parse({
        seriesId: spec.id,
        asOf: now.toISOString(),
        observations: fetched.observations,
        meta: fetched.meta,
      });

      const appended = appendSeriesObservations(spec.id, snapshot.observations, options.rootDir);
      writeSeriesMeta(snapshot, options.rootDir);

      observationsAppended += appended.appended;
      if (appended.appended > 0) {
        seriesUpdated += 1;
      }

      nextState.series[spec.id] = {
        updatedAt: now.toISOString(),
        lastObservationDate: appended.lastObservationDate,
        observationsCount: appended.total,
      };
    } catch (error) {
      errors.push(toRefreshError(error, spec.sourceId, spec.id));
    }
  }

  nextState.lastRunAt = now.toISOString();
  writeState(nextState, options.rootDir);

  return RefreshResultSchema.parse({
    sourcesProcessed: uniqueSources(specs.filter((spec) => sourceMap.has(spec.sourceId))).size,
    seriesProcessed,
    seriesUpdated,
    observationsAppended,
    errors,
  });
}

async function main(): Promise<void> {
  const result = await runIndicatorsRefresh();
  console.log(`[planning:v3:indicators:refresh] sources=${result.sourcesProcessed} series=${result.seriesProcessed} updated=${result.seriesUpdated} appended=${result.observationsAppended} errors=${result.errors.length}`);
}

const invokedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath && path.resolve(modulePath) === path.resolve(invokedPath)) {
  main().catch((error) => {
    const normalized = normalizeConnectorError(error);
    console.error(`[planning:v3:indicators:refresh] failed: ${normalized.message}`);
    process.exitCode = 1;
  });
}
