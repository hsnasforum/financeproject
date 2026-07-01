import { z } from "zod";
import { ObservationSchema } from "../indicators/contracts";

export const AlertSourceSchema = z.enum(["news:refresh", "indicators:refresh"]);
export type AlertSource = z.infer<typeof AlertSourceSchema>;

export const AlertLevelSchema = z.enum(["high", "medium", "low"]);
export type AlertLevel = z.infer<typeof AlertLevelSchema>;

export const AlertRuleKindSchema = z.enum(["topic_burst", "indicator"]);
export type AlertRuleKind = z.infer<typeof AlertRuleKindSchema>;

export const AlertConditionSchema = z.enum(["up", "down", "high", "low", "flat", "unknown"]);
export type AlertCondition = z.infer<typeof AlertConditionSchema>;

export const AlertMetricSchema = z.enum(["pctChange", "zscore", "regime"]);
export type AlertMetric = z.infer<typeof AlertMetricSchema>;

export const AlertTargetTypeSchema = z.enum(["topic", "item", "scenario", "series"]);
export type AlertTargetType = z.infer<typeof AlertTargetTypeSchema>;

const AlertRuleBaseSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  level: AlertLevelSchema.default("medium"),
});

export const TopicBurstRuleSchema = AlertRuleBaseSchema.extend({
  kind: z.literal("topic_burst"),
  topicId: z.string().trim().min(1).default("*"),
  minBurstLevel: z.enum(["상", "중"]).default("중"),
  minTodayCount: z.number().int().nonnegative().default(1),
});

export type TopicBurstRule = z.infer<typeof TopicBurstRuleSchema>;

export const IndicatorRuleSchema = AlertRuleBaseSchema.extend({
  kind: z.literal("indicator"),
  seriesId: z.string().trim().min(1),
  metric: AlertMetricSchema,
  window: z.number().int().positive().max(365).default(12),
  condition: AlertConditionSchema,
  threshold: z.number().finite().optional(),
  targetType: AlertTargetTypeSchema.optional(),
  targetId: z.string().trim().min(1).optional(),
});

export type IndicatorRule = z.infer<typeof IndicatorRuleSchema>;

export const AlertRuleSchema = z.discriminatedUnion("kind", [
  TopicBurstRuleSchema,
  IndicatorRuleSchema,
]);

export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const AlertRulesConfigSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  version: z.number().int().positive().default(1),
  generatedAt: z.string().datetime().optional(),
  rules: z.array(AlertRuleSchema).default([]),
});

export type AlertRulesConfig = z.infer<typeof AlertRulesConfigSchema>;

export const AlertRuleOverrideSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  level: AlertLevelSchema.optional(),
  topicId: z.string().trim().min(1).optional(),
  minBurstLevel: z.enum(["중", "상"]).optional(),
  minTodayCount: z.number().int().nonnegative().optional(),
  seriesId: z.string().trim().min(1).optional(),
  metric: AlertMetricSchema.optional(),
  window: z.number().int().positive().max(365).optional(),
  condition: AlertConditionSchema.optional(),
  threshold: z.number().finite().optional(),
  targetType: AlertTargetTypeSchema.optional(),
  targetId: z.string().trim().min(1).optional(),
});

export type AlertRuleOverride = z.infer<typeof AlertRuleOverrideSchema>;

export const AlertRuleOverridesSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  updatedAt: z.string().datetime().optional(),
  rules: z.array(AlertRuleOverrideSchema).default([]),
});

export type AlertRuleOverrides = z.infer<typeof AlertRuleOverridesSchema>;

export const TopicTrendSignalSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  todayCount: z.number().int().nonnegative(),
  burstLevel: z.enum(["상", "중", "하"]),
});

export type TopicTrendSignal = z.infer<typeof TopicTrendSignalSchema>;

export const IndicatorSeriesSignalSchema = z.object({
  seriesId: z.string().trim().min(1),
  observations: z.array(ObservationSchema),
});

export type IndicatorSeriesSignal = z.infer<typeof IndicatorSeriesSignalSchema>;

export const AlertSnapshotSchema = z.object({
  triggerStatus: z.enum(["met", "not_met", "unknown"]).optional(),
  burstLevel: z.enum(["상", "중", "하", "unknown"]).optional(),
  indicator: z.object({
    metric: AlertMetricSchema,
    condition: AlertConditionSchema,
    status: z.enum(["met", "not_met", "unknown"]),
  }).optional(),
});

export type AlertSnapshot = z.infer<typeof AlertSnapshotSchema>;

export const AlertEventSchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  dayKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: AlertSourceSchema,
  ruleId: z.string().trim().min(1),
  ruleKind: AlertRuleKindSchema,
  level: AlertLevelSchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  targetType: AlertTargetTypeSchema,
  targetId: z.string().trim().min(1),
  link: z.string().trim().min(1).optional(),
  topicId: z.string().trim().min(1).optional(),
  seriesId: z.string().trim().min(1).optional(),
  snapshot: AlertSnapshotSchema.optional(),
});

export type AlertEvent = z.infer<typeof AlertEventSchema>;

export const EvaluateAlertsInputSchema = z.object({
  generatedAt: z.string().datetime(),
  source: AlertSourceSchema,
  rules: z.array(AlertRuleSchema),
  topicTrends: z.array(TopicTrendSignalSchema).default([]),
  seriesSnapshots: z.array(IndicatorSeriesSignalSchema).default([]),
});

export type EvaluateAlertsInput = z.infer<typeof EvaluateAlertsInputSchema>;
