import { z } from "zod";

export const IndicatorSourceTypeSchema = z.enum(["fixture", "ecos", "kosis", "fred"]);
export type IndicatorSourceType = z.infer<typeof IndicatorSourceTypeSchema>;

export const IndicatorSourceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: IndicatorSourceTypeSchema,
  enabled: z.boolean(),
});

export type IndicatorSource = z.infer<typeof IndicatorSourceSchema>;

export const SeriesFrequencySchema = z.enum(["D", "W", "M", "Q", "Y"]);
export type SeriesFrequency = z.infer<typeof SeriesFrequencySchema>;

export const SeriesTransformSchema = z.enum(["none", "pct_change", "diff", "log"]);
export type SeriesTransform = z.infer<typeof SeriesTransformSchema>;

export const SeriesSpecSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  frequency: SeriesFrequencySchema,
  units: z.string().trim().min(1).optional(),
  transform: SeriesTransformSchema.optional(),
  notes: z.string().trim().min(1).optional(),
  enabled: z.boolean().default(true),
});

export type SeriesSpec = z.infer<typeof SeriesSpecSchema>;

const OBS_DATE_REGEX = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|-(?:Q[1-4]))?$/;

export const ObservationSchema = z.object({
  date: z.string().trim().regex(OBS_DATE_REGEX),
  value: z.number().finite(),
});

export type Observation = z.infer<typeof ObservationSchema>;

export const SeriesSnapshotMetaSchema = z.object({
  sourceId: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  frequency: SeriesFrequencySchema,
  units: z.string().trim().min(1).optional(),
  transform: SeriesTransformSchema.optional(),
  notes: z.string().trim().min(1).optional(),
});

export type SeriesSnapshotMeta = z.infer<typeof SeriesSnapshotMetaSchema>;

export const SeriesSnapshotSchema = z.object({
  seriesId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  observations: z.array(ObservationSchema),
  meta: SeriesSnapshotMetaSchema,
});

export type SeriesSnapshot = z.infer<typeof SeriesSnapshotSchema>;

export const SeriesStateSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  lastObservationDate: z.string().trim().regex(OBS_DATE_REGEX).optional(),
  observationsCount: z.number().int().nonnegative().default(0),
});

export type SeriesState = z.infer<typeof SeriesStateSchema>;

export const IndicatorsStateSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  lastRunAt: z.string().datetime().optional(),
  series: z.record(z.string(), SeriesStateSchema).default({}),
});

export type IndicatorsState = z.infer<typeof IndicatorsStateSchema>;

export const RefreshErrorSchema = z.object({
  sourceId: z.string().trim().min(1),
  seriesId: z.string().trim().min(1).optional(),
  code: z.enum(["INPUT", "FETCH", "PARSE", "LIMIT", "INTERNAL"]),
  message: z.string().trim().min(1),
});

export type RefreshError = z.infer<typeof RefreshErrorSchema>;
export type ConnectorErrorCode = RefreshError["code"];

export const RefreshResultSchema = z.object({
  sourcesProcessed: z.number().int().nonnegative(),
  seriesProcessed: z.number().int().nonnegative(),
  seriesUpdated: z.number().int().nonnegative(),
  observationsAppended: z.number().int().nonnegative(),
  errors: z.array(RefreshErrorSchema),
});

export type RefreshResult = z.infer<typeof RefreshResultSchema>;

export function parseIndicatorSource(value: unknown): IndicatorSource {
  return IndicatorSourceSchema.parse(value);
}

export function parseSeriesSpec(value: unknown): SeriesSpec {
  return SeriesSpecSchema.parse(value);
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

export function parseRefreshResult(value: unknown): RefreshResult {
  return RefreshResultSchema.parse(value);
}
