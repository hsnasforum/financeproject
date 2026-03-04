import {
  RefreshResultSchema,
  type IndicatorSource,
  type RefreshResult,
  type SeriesSnapshot,
  type SeriesSpec,
} from "../contracts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFixtureSeries } from "../connectors/fixture";
import { INDICATOR_SERIES_SPECS, INDICATOR_SOURCES } from "../specs";
import { appendSeriesObservations, readState, writeSeriesMeta, writeState } from "../store";

type RunIndicatorsRefreshOptions = {
  rootDir?: string;
  sources?: IndicatorSource[];
  specs?: SeriesSpec[];
  now?: Date;
};

function uniqueSources(specs: SeriesSpec[]): Set<string> {
  return new Set(specs.map((row) => row.sourceId));
}

async function fetchSnapshotForSpec(spec: SeriesSpec, source: IndicatorSource, now: Date): Promise<SeriesSnapshot> {
  if (source.type === "fixture") {
    return fetchFixtureSeries(spec, now);
  }
  throw new Error(`connector_not_implemented:${source.type}`);
}

export async function runIndicatorsRefresh(options: RunIndicatorsRefreshOptions = {}): Promise<RefreshResult> {
  const now = options.now ?? new Date();
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
        code: "SOURCE_NOT_ENABLED",
        message: `enabled source not found: ${spec.sourceId}`,
      });
      continue;
    }

    seriesProcessed += 1;

    try {
      const snapshot = await fetchSnapshotForSpec(spec, source, now);
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
      const message = error instanceof Error ? error.message : "unknown_error";
      errors.push({
        sourceId: spec.sourceId,
        seriesId: spec.id,
        code: "FETCH_FAILED",
        message,
      });
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
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(`[planning:v3:indicators:refresh] failed: ${message}`);
    process.exitCode = 1;
  });
}
