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
import { ConnectorError, normalizeConnectorError, shouldRetryConnectorError, toRefreshError } from "../connectors/errors";
import type { ConnectorSeriesResult, SeriesConnector } from "../connectors/types";
import {
  IndicatorConfigError,
  loadEffectiveIndicatorConfig,
} from "../specOverrides";
import {
  IndicatorObservationConflictError,
  appendSeriesObservations,
  readState,
  writeSeriesMeta,
  writeState,
} from "../store";
import { sanitizeV3LogMessage } from "../../security/whitelist";
import { clampFlooredInteger } from "../../../calc/roundingPolicy";

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

export type RunIndicatorsRefreshOptions = {
  cwd?: string;
  rootDir?: string;
  sources?: IndicatorSource[];
  specs?: SeriesSpec[];
  dry?: boolean;
  now?: Date;
  retry?: RetryPolicy;
  connectorResolver?: (source: IndicatorSource) => SeriesConnector;
};

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRetryPolicy(retry: RetryPolicy | undefined): ResolvedRetryPolicy {
  const maxAttempts = clampFlooredInteger(retry?.maxAttempts, 1, Number.MAX_SAFE_INTEGER, 2);
  const baseDelayMs = clampFlooredInteger(retry?.baseDelayMs, 0, Number.MAX_SAFE_INTEGER, 25);

  return {
    maxAttempts,
    baseDelayMs,
    sleep: retry?.sleep ?? defaultSleep,
  };
}

function uniqueSources(specs: SeriesSpec[]): Set<string> {
  return new Set(specs.map((row) => row.sourceId));
}

function daysAgo(base: Date, dayOffset: number): string {
  return new Date(base.getTime() - (dayOffset * 24 * 60 * 60 * 1_000))
    .toISOString()
    .slice(0, 10);
}

function monthsAgo(base: Date, monthOffset: number): string {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthOffset, 1))
    .toISOString()
    .slice(0, 10);
}

function quartersAgo(base: Date, quarterOffset: number): string {
  const month = Math.floor(base.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(base.getUTCFullYear(), month - (quarterOffset * 3), 1))
    .toISOString()
    .slice(0, 10);
}

function yearsAgo(base: Date, yearOffset: number): string {
  return new Date(Date.UTC(base.getUTCFullYear() - yearOffset, 0, 1))
    .toISOString()
    .slice(0, 10);
}

function dryObservationSeed(spec: SeriesSpec): number {
  let seed = 0;
  for (let index = 0; index < spec.id.length; index += 1) {
    seed = ((seed * 31) + spec.id.charCodeAt(index)) % 100_000;
  }
  return seed;
}

function buildDryObservations(spec: SeriesSpec, now: Date) {
  const count = spec.frequency === "D" || spec.frequency === "W"
    ? 30
    : spec.frequency === "M"
      ? 24
      : spec.frequency === "Q"
        ? 16
        : 12;
  const seed = dryObservationSeed(spec);
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const date = spec.frequency === "D"
      ? daysAgo(now, offset)
      : spec.frequency === "W"
        ? daysAgo(now, offset * 7)
        : spec.frequency === "M"
          ? monthsAgo(now, offset)
          : spec.frequency === "Q"
            ? quartersAgo(now, offset)
            : yearsAgo(now, offset);
    return {
      date,
      value: Number(((seed % 300) / 10 + (index + 1) * 0.17).toFixed(4)),
    };
  });
}

function createDryConnector(source: IndicatorSource): SeriesConnector {
  return {
    sourceType: source.type,
    async fetchSeries(spec, options) {
      return {
        observations: buildDryObservations(spec, options.asOf),
        meta: {
          sourceId: spec.sourceId,
          externalId: spec.externalId,
          frequency: spec.frequency,
          units: spec.units,
          transform: spec.transform,
          notes: spec.notes,
        },
      };
    },
  };
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
  const hasCompleteExplicitConfig = Array.isArray(options.sources) && Array.isArray(options.specs);
  const effective = hasCompleteExplicitConfig
    ? null
    : loadEffectiveIndicatorConfig({
      cwd: options.cwd,
      rootDir: options.rootDir,
    });
  if (effective?.baseSource === "built-in" && !options.dry) {
    throw new IndicatorConfigError(
      "UNSAFE_BUILT_IN_CONFIG",
      "non-dry indicator refresh requires explicit compatibility config",
    );
  }
  const sources = (options.sources ?? effective?.sources ?? []).filter((source) => source.enabled);
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const specs = (options.specs ?? effective?.specs ?? []).filter((spec) => spec.enabled !== false);
  const configSource = options.sources || options.specs ? "explicit" : effective?.baseSource ?? "built-in";

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
      const connector = options.dry
        ? createDryConnector(source)
        : options.connectorResolver
          ? options.connectorResolver(source)
          : getConnector(source);
      const fetched = await fetchWithRetry(connector, spec, now, retryPolicy);

      const snapshot = SeriesSnapshotSchema.parse({
        seriesId: spec.id,
        asOf: now.toISOString(),
        observations: fetched.observations,
        meta: fetched.meta,
      });

      const appended = appendSeriesObservations(
        spec.id,
        snapshot.observations,
        options.rootDir,
        { frequency: spec.frequency },
      );
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
      const refreshError = error instanceof IndicatorObservationConflictError
        ? new ConnectorError("PARSE", error.message)
        : error;
      errors.push(toRefreshError(refreshError, spec.sourceId, spec.id));
    }
  }

  nextState.lastRunAt = now.toISOString();
  writeState(nextState, options.rootDir);

  return RefreshResultSchema.parse({
    generatedAt: now.toISOString(),
    configSource,
    enabledSourceCount: sources.length,
    enabledSeriesCount: specs.length,
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
    console.error(`[planning:v3:indicators:refresh] failed: ${sanitizeV3LogMessage(normalized.message)}`);
    process.exitCode = 1;
  });
}
