import { TopicScenarioTemplateSchema, type TopicScenarioTemplate } from "./contracts";
import { SCENARIO_LIBRARY_SSOT } from "../../scenarios/library";

export const TOPIC_SCENARIO_TEMPLATES: TopicScenarioTemplate[] = SCENARIO_LIBRARY_SSOT
  .map((row) => TopicScenarioTemplateSchema.parse({
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    observation: row.observation,
    invalidation: row.invalidation,
    options: row.options,
  }));

export const TOPIC_SCENARIO_TEMPLATE_MAP = new Map(
  TOPIC_SCENARIO_TEMPLATES.map((row) => [row.topicId, row] as const),
);
