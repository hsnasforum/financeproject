import { z } from "zod";

export const NewsSourceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  feedUrl: z.string().trim().url(),
  homepageUrl: z.string().trim().url().optional(),
  country: z.string().trim().min(2).max(3),
  language: z.string().trim().min(2).max(5),
  weight: z.number().finite(),
  enabled: z.boolean(),
});

export type NewsSource = z.infer<typeof NewsSourceSchema>;

export const NewsItemSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  publishedAt: z.string().datetime().optional(),
  guid: z.string().trim().min(1).optional(),
  snippet: z.string().max(1500).optional(),
  fetchedAt: z.string().datetime(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsNoteTargetTypeSchema = z.enum(["item", "topic", "scenario"]);
export type NewsNoteTargetType = z.infer<typeof NewsNoteTargetTypeSchema>;

export const NewsNoteSchema = z.object({
  targetType: NewsNoteTargetTypeSchema,
  targetId: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  note: z.string().trim().min(1),
  createdAt: z.string().datetime(),
});

export type NewsNote = z.infer<typeof NewsNoteSchema>;

export const IngestErrorSchema = z.object({
  sourceId: z.string().trim().min(1),
  message: z.string().trim().min(1),
  status: z.number().int().optional(),
});

export type IngestError = z.infer<typeof IngestErrorSchema>;

export const IngestResultSchema = z.object({
  sourcesProcessed: z.number().int().nonnegative(),
  itemsFetched: z.number().int().nonnegative(),
  itemsNew: z.number().int().nonnegative(),
  itemsDeduped: z.number().int().nonnegative(),
  errors: z.array(IngestErrorSchema),
});

export type IngestResult = z.infer<typeof IngestResultSchema>;

export const RawFeedEntrySchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  guid: z.string().optional(),
  publishedAt: z.string().optional(),
  snippet: z.string().optional(),
});

export type RawFeedEntry = z.infer<typeof RawFeedEntrySchema>;

export const SourceRuntimeStateSchema = z.object({
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  lastRunAt: z.string().datetime().optional(),
});

export type SourceRuntimeState = z.infer<typeof SourceRuntimeStateSchema>;

export const RuntimeStateSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  lastRunAt: z.string().datetime().optional(),
  sources: z.record(z.string(), SourceRuntimeStateSchema).default({}),
});

export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export const NewsSourceOverrideSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  weight: z.number().finite().optional(),
});

export type NewsSourceOverride = z.infer<typeof NewsSourceOverrideSchema>;

export const NewsTopicOverrideSchema = z.object({
  id: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).optional(),
});

export type NewsTopicOverride = z.infer<typeof NewsTopicOverrideSchema>;

export const NewsSettingsSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  updatedAt: z.string().datetime().optional(),
  sources: z.array(NewsSourceOverrideSchema).default([]),
  topics: z.array(NewsTopicOverrideSchema).default([]),
});

export type NewsSettings = z.infer<typeof NewsSettingsSchema>;

export const NewsTopicSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)),
  entities: z.array(z.string().trim().min(1)).optional(),
});

export type NewsTopic = z.infer<typeof NewsTopicSchema>;

export const TopicTagSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  keywordHits: z.number().int().nonnegative(),
  entityHits: z.number().int().nonnegative(),
  hits: z.array(z.string().trim().min(1)),
});

export type TopicTag = z.infer<typeof TopicTagSchema>;

export const ScorePartsSchema = z.object({
  sourceWeight: z.number().finite(),
  recency: z.number().finite(),
  keywordHits: z.number().finite(),
  burstPlaceholder: z.number().finite(),
});

export type ScoreParts = z.infer<typeof ScorePartsSchema>;

export const ScoredNewsItemSchema = NewsItemSchema.extend({
  tags: z.array(TopicTagSchema),
  primaryTopicId: z.string().trim().min(1),
  primaryTopicLabel: z.string().trim().min(1),
  scoreParts: ScorePartsSchema,
  totalScore: z.number().finite(),
});

export type ScoredNewsItem = z.infer<typeof ScoredNewsItemSchema>;

export const NewsClusterSchema = z.object({
  clusterId: z.string().trim().min(1),
  representative: ScoredNewsItemSchema,
  items: z.array(ScoredNewsItemSchema).min(1),
});

export type NewsCluster = z.infer<typeof NewsClusterSchema>;

export const TopTopicSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  scoreSum: z.number().finite(),
  topScore: z.number().finite(),
});

export type TopTopic = z.infer<typeof TopTopicSchema>;

export const SelectTopResultSchema = z.object({
  windowHours: z.number().int().positive(),
  totalCandidates: z.number().int().nonnegative(),
  topItems: z.array(ScoredNewsItemSchema),
  clusters: z.array(NewsClusterSchema).default([]),
  topTopics: z.array(TopTopicSchema),
});

export type SelectTopResult = z.infer<typeof SelectTopResultSchema>;

export const BurstGradeSchema = z.enum(["High", "Med", "Low", "Unknown", "상", "중", "하"]);
export type BurstGrade = z.infer<typeof BurstGradeSchema>;

export const TopicDailyStatSchema = z.object({
  dateKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  scoreSum: z.number().finite().default(0),
  sourceDiversity: z.number().finite().min(0).max(1).default(0),
  baselineMean: z.number().finite().default(0),
  baselineStddev: z.number().finite().default(0),
  burstZ: z.number().finite().default(0),
  burstGrade: BurstGradeSchema,
});

export type TopicDailyStat = z.infer<typeof TopicDailyStatSchema>;

export const DateRangeSchema = z.object({
  fromKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DateRange = z.infer<typeof DateRangeSchema>;

export const DigestWatchViewSchema = z.enum(["last", "pctChange", "zscore", "trend"]);
export type DigestWatchView = z.infer<typeof DigestWatchViewSchema>;

export const DigestWatchSpecSchema = z.object({
  label: z.string().trim().min(1),
  seriesId: z.string().trim().min(1),
  view: DigestWatchViewSchema,
  window: z.number().int().positive(),
});

export type DigestWatchSpec = z.infer<typeof DigestWatchSpecSchema>;

export const DigestWatchItemSchema = DigestWatchSpecSchema.extend({
  status: z.enum(["ok", "unknown"]),
  grade: z.enum(["상", "중", "하", "unknown"]),
  compactSummary: z.string().trim().min(1),
  asOf: z.string().trim().min(1).nullable().optional(),
});

export type DigestWatchItem = z.infer<typeof DigestWatchItemSchema>;

export const DailyDigestSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  generatedAt: z.string().datetime(),
  dateRange: DateRangeSchema,
  topItems: z.array(ScoredNewsItemSchema),
  topTopics: z.array(TopTopicSchema),
  burstTopics: z.array(TopicDailyStatSchema),
  watchlist: z.array(DigestWatchItemSchema),
  observationLines: z.array(z.string().trim().min(1)),
});

export type DailyDigest = z.infer<typeof DailyDigestSchema>;

export const ScenarioNameSchema = z.enum(["Base", "Bull", "Bear"]);
export type ScenarioName = z.infer<typeof ScenarioNameSchema>;

export const ScenarioTriggerMetricSchema = z.enum(["pctChange", "zscore", "regime"]);
export type ScenarioTriggerMetric = z.infer<typeof ScenarioTriggerMetricSchema>;

export const ScenarioTriggerConditionSchema = z.enum(["up", "down", "high", "low", "flat", "unknown"]);
export type ScenarioTriggerCondition = z.infer<typeof ScenarioTriggerConditionSchema>;

export const ScenarioTriggerOpSchema = z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]);
export type ScenarioTriggerOp = z.infer<typeof ScenarioTriggerOpSchema>;

export const ScenarioRegimeValueSchema = z.enum(["up", "flat", "down", "unknown"]);
export type ScenarioRegimeValue = z.infer<typeof ScenarioRegimeValueSchema>;

export const ScenarioTriggerRuleSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  seriesId: z.string().trim().min(1),
  window: z.number().int().positive(),
  metric: ScenarioTriggerMetricSchema.optional(),
  condition: ScenarioTriggerConditionSchema.optional(),
  // legacy fields: supported for compatibility via evaluator conversion.
  view: ScenarioTriggerMetricSchema.optional(),
  op: ScenarioTriggerOpSchema.optional(),
  threshold: z.number().finite().optional(),
  regimeValue: ScenarioRegimeValueSchema.optional(),
});

export type ScenarioTriggerRule = z.infer<typeof ScenarioTriggerRuleSchema>;

export const ScenarioTemplateSchema = z.object({
  name: ScenarioNameSchema,
  triggers: z.array(ScenarioTriggerRuleSchema).min(1),
});

export type ScenarioTemplate = z.infer<typeof ScenarioTemplateSchema>;

export const ScenarioTriggerStatusSchema = z.enum(["met", "not_met", "unknown"]);
export type ScenarioTriggerStatus = z.infer<typeof ScenarioTriggerStatusSchema>;

export const TriggerEvaluationSchema = z.object({
  ruleId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: ScenarioTriggerStatusSchema,
  rationale: z.string().trim().min(1),
});

export type TriggerEvaluation = z.infer<typeof TriggerEvaluationSchema>;

export const ScenarioCardSchema = z.object({
  name: ScenarioNameSchema,
  triggerStatus: ScenarioTriggerStatusSchema,
  triggerRationale: z.string().trim().min(1),
  triggerEvaluations: z.array(TriggerEvaluationSchema).min(1),
  observation: z.string().trim().min(1),
  interpretations: z.array(z.string().trim().min(1)).min(1),
  invalidation: z.array(z.string().trim().min(1)).min(1),
  indicators: z.array(z.string().trim().min(1)).min(1),
  options: z.array(z.string().trim().min(1)).min(1),
});

export type ScenarioCard = z.infer<typeof ScenarioCardSchema>;

export const ScenarioPackSchema = z.object({
  generatedAt: z.string().datetime(),
  cards: z.array(ScenarioCardSchema).length(3),
});

export type ScenarioPack = z.infer<typeof ScenarioPackSchema>;

export function parseNewsSource(value: unknown): NewsSource {
  return NewsSourceSchema.parse(value);
}

export function parseNewsItem(value: unknown): NewsItem {
  return NewsItemSchema.parse(value);
}

export function parseNewsNote(value: unknown): NewsNote {
  return NewsNoteSchema.parse(value);
}

export function parseRuntimeState(value: unknown): RuntimeState {
  return RuntimeStateSchema.parse(value);
}

export function parseNewsSettings(value: unknown): NewsSettings {
  return NewsSettingsSchema.parse(value);
}

export function parseScoredNewsItem(value: unknown): ScoredNewsItem {
  return ScoredNewsItemSchema.parse(value);
}

export function parseTopicDailyStat(value: unknown): TopicDailyStat {
  return TopicDailyStatSchema.parse(value);
}

export function parseDailyDigest(value: unknown): DailyDigest {
  return DailyDigestSchema.parse(value);
}

export function parseScenarioPack(value: unknown): ScenarioPack {
  return ScenarioPackSchema.parse(value);
}
