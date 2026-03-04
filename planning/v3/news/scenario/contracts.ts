import { z } from "zod";

export const ScenarioNameSchema = z.enum(["Base", "Bull", "Bear"]);
export type ScenarioName = z.infer<typeof ScenarioNameSchema>;

export const TriggerKindSchema = z.enum(["topicBurst", "topicShare", "sourceDiversity"]);
export type TriggerKind = z.infer<typeof TriggerKindSchema>;

export const TriggerConditionSchema = z.enum(["high", "med", "low"]);
export type TriggerCondition = z.infer<typeof TriggerConditionSchema>;

export const TriggerSchema = z.object({
  kind: TriggerKindSchema,
  topicId: z.string().trim().min(1),
  condition: TriggerConditionSchema,
  note: z.string().trim().min(1).optional(),
});
export type Trigger = z.infer<typeof TriggerSchema>;

export const ScenarioCardSchema = z.object({
  name: ScenarioNameSchema,
  observation: z.string().trim().min(1),
  triggers: z.array(TriggerSchema).min(1),
  invalidation: z.array(z.string().trim().min(1)).min(1),
  indicators: z.array(z.string().trim().min(1)).min(1),
  options: z.array(z.string().trim().min(1)).min(1),
  linkedTopics: z.array(z.string().trim().min(1)).min(1).max(3),
  changeAttribution: z.object({
    title: z.literal("가능한 요인"),
    drivers: z.array(z.string().trim().min(1)).min(1).max(4),
  }).optional(),
  quality: z.object({
    dedupeLevel: z.enum(["high", "med", "low"]),
    contradictionLevel: z.enum(["high", "med", "low"]),
    uncertaintyLabels: z.array(z.string().trim().min(1)).max(4),
  }).optional(),
});
export type ScenarioCard = z.infer<typeof ScenarioCardSchema>;

export const ScenarioPackSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  generatedAt: z.string().datetime(),
  cards: z.array(ScenarioCardSchema).length(3),
});
export type ScenarioPack = z.infer<typeof ScenarioPackSchema>;

export const TopicScenarioTemplateSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  observation: z.object({
    base: z.string().trim().min(1),
    bull: z.string().trim().min(1),
    bear: z.string().trim().min(1),
  }),
  invalidation: z.object({
    base: z.array(z.string().trim().min(1)).min(1),
    bull: z.array(z.string().trim().min(1)).min(1),
    bear: z.array(z.string().trim().min(1)).min(1),
  }),
  options: z.object({
    base: z.array(z.string().trim().min(1)).min(1),
    bull: z.array(z.string().trim().min(1)).min(1),
    bear: z.array(z.string().trim().min(1)).min(1),
  }),
});
export type TopicScenarioTemplate = z.infer<typeof TopicScenarioTemplateSchema>;
