import { z } from "zod";
import {
  type IndicatorSeriesFile,
  type IndicatorsState,
  type IndicatorsRefreshResult,
  type IndicatorSource,
  type IndicatorSourcesFile,
  type Observation,
  type SeriesSnapshot,
  type SeriesSpec,
} from "./types.ts";

export const IndicatorSourceTypeSchema = z.enum(["ecos", "kosis", "fred"]);
export const IndicatorTransformSchema = z.enum(["none", "pct_change", "diff", "log"]);
export const IndicatorFrequencySchema = z.enum(["D", "W", "M", "Q", "A"]);

export const IndicatorSourceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: IndicatorSourceTypeSchema,
  enabled: z.boolean(),
});

export const IndicatorSourcesFileSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime().optional(),
  sources: z.array(IndicatorSourceSchema),
});

export const SeriesSpecSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  frequency: IndicatorFrequencySchema,
  units: z.string().trim().min(1).optional(),
  transform: IndicatorTransformSchema.optional(),
  notes: z.string().trim().min(1).optional(),
});

export const IndicatorSeriesFileSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime().optional(),
  series: z.array(SeriesSpecSchema),
});

export const ObservationSchema = z.object({
  date: z.string().trim().min(1),
  value: z.number().finite(),
});

export const SeriesSnapshotSchema = z.object({
  seriesId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  observations: z.array(ObservationSchema),
  meta: z.object({
    sourceId: z.string().trim().min(1),
    externalId: z.string().trim().min(1),
    frequency: IndicatorFrequencySchema,
    units: z.string().trim().min(1).optional(),
    transform: IndicatorTransformSchema,
    lastUpdatedAt: z.string().datetime(),
    observationCount: z.number().int().nonnegative(),
  }),
});

export const SourceRuntimeStateSchema = z.object({
  etag: z.string().trim().min(1).optional(),
  lastModified: z.string().trim().min(1).optional(),
  lastRunAt: z.string().datetime().optional(),
  cursor: z.string().trim().min(1).optional(),
});

export const IndicatorsStateSchema = z.object({
  lastRunAt: z.string().datetime().optional(),
  sources: z.record(z.string(), SourceRuntimeStateSchema).default({}),
});

export const IndicatorsRefreshErrorSchema = z.object({
  sourceId: z.string().trim().min(1),
  seriesId: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

export const IndicatorsRefreshResultSchema = z.object({
  generatedAt: z.string().datetime(),
  sourcesProcessed: z.number().int().nonnegative(),
  seriesProcessed: z.number().int().nonnegative(),
  seriesUpdated: z.number().int().nonnegative(),
  observationsAppended: z.number().int().nonnegative(),
  errors: z.array(IndicatorsRefreshErrorSchema),
});

export function parseIndicatorSource(value: unknown): IndicatorSource {
  return IndicatorSourceSchema.parse(value);
}

export function parseIndicatorSourcesFile(value: unknown): IndicatorSourcesFile {
  return IndicatorSourcesFileSchema.parse(value);
}

export function parseSeriesSpec(value: unknown): SeriesSpec {
  return SeriesSpecSchema.parse(value);
}

export function parseIndicatorSeriesFile(value: unknown): IndicatorSeriesFile {
  return IndicatorSeriesFileSchema.parse(value);
}

export function parseObservation(value: unknown): Observation {
  return ObservationSchema.parse(value);
}

export function parseSeriesSnapshot(value: unknown): SeriesSnapshot {
  return SeriesSnapshotSchema.parse(value);
}

export function parseIndicatorsState(value: unknown): IndicatorsState {
  return IndicatorsStateSchema.parse(value);
}

export function parseIndicatorsRefreshResult(value: unknown): IndicatorsRefreshResult {
  return IndicatorsRefreshResultSchema.parse(value);
}
