import { readNewsScenarioPack as readLegacyNewsScenarioPack } from "@/lib/news/scenarioReader";
import { readLatestDraftSummaryForStress } from "@/lib/news/stressContext";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";
import {
  readScenariosCache as readStoredScenariosCache,
  readTodayCache as readStoredTodayCache,
  type ScenariosCache,
  type TodayCache,
} from "@/lib/planning/v3/news/store";
import { type ScenarioCard, type ScenarioPack } from "@/lib/planning/v3/news/scenario/contracts";
import { type NewsScenarioPack } from "@/lib/news/types";

export { readLatestDraftSummaryForStress };
export type { NewsScenarioPack } from "@/lib/news/types";

function triggerStatus(card: ScenarioCard): "met" | "not_met" | "unknown" {
  const conditions = card.triggers.map((trigger) => trigger.condition);
  if (conditions.length < 1) return "unknown";
  if (conditions.some((condition) => condition === "high" || condition === "med")) return "met";
  if (conditions.every((condition) => condition === "low")) return "not_met";
  return "unknown";
}

function triggerText(card: ScenarioCard): string[] {
  return card.triggers.map((trigger) => `${trigger.kind}(${trigger.topicId},${trigger.condition})`);
}

function linkedTopics(pack: ScenarioPack): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const card of pack.cards) {
    for (const topic of card.linkedTopics) {
      const normalized = topic.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function fromScenarioPack(pack: ScenarioPack, generatedAt = pack.generatedAt): NewsScenarioPack {
  const topics = linkedTopics(pack);
  return {
    generatedAt,
    input: {
      topTopicIds: topics.slice(0, 5),
      risingTopicIds: [],
      macroSnapshot: {
        asOf: generatedAt,
        source: "planning-v3-news-store",
        values: {},
      },
    },
    scenarios: pack.cards.map((card) => {
      const triggers = triggerText(card);
      const status = triggerStatus(card);
      return {
        name: card.name,
        confidence: "중",
        triggerStatus: status,
        triggerSummary: triggers.join(", "),
        observation: card.observation,
        interpretations: card.changeAttribution?.drivers ?? [card.observation],
        confirmIndicators: card.indicators,
        options: card.options,
        assumptions: card.triggers.map((trigger) => trigger.note ?? trigger.topicId),
        trigger: triggers,
        triggerDetails: card.triggers.map((trigger) => ({
          label: trigger.topicId,
          expression: `${trigger.kind}(${trigger.topicId},${trigger.condition})`,
          status,
          summary: trigger.note ?? trigger.condition,
        })),
        leadingIndicators: card.indicators,
        invalidation: card.invalidation,
        impact: card.linkedTopics.join(", "),
        monitoringOptions: card.options,
        rationale: card.quality?.uncertaintyLabels ?? [card.observation],
        linkedTopics: card.linkedTopics,
      };
    }),
  };
}

function fromScenariosCache(cache: ScenariosCache): NewsScenarioPack {
  return fromScenarioPack(cache.scenarios, cache.generatedAt);
}

function fromTodayCache(cache: TodayCache): NewsScenarioPack {
  return fromScenarioPack(cache.scenarios, cache.generatedAt);
}

export function readNewsScenarioPack(): NewsScenarioPack | null {
  const scenariosCache = readStoredScenariosCache();
  if (scenariosCache) return fromScenariosCache(scenariosCache);

  const todayCache = readStoredTodayCache();
  if (todayCache) return fromTodayCache(todayCache);

  if (isPlanningNamespaceEnabled()) return null;
  return readLegacyNewsScenarioPack();
}
