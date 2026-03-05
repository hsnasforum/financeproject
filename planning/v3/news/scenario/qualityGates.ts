import { type DigestDay } from "../digest/contracts";
import {
  computeTopicContradictions,
  type ContradictionGrade,
  type ContradictionSourceItem,
} from "../contradiction";

export type ScenarioQualityLevel = "high" | "med" | "low";

export type ScenarioQualityGateResult = {
  dedupeLevel: ScenarioQualityLevel;
  contradictionLevel: ScenarioQualityLevel;
  uncertaintyLabels: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contradictionToQuality(value: ContradictionGrade): ScenarioQualityLevel {
  if (value === "high") return "high";
  if (value === "med") return "med";
  return "low";
}

function dedupeLevelFromDigest(digest: DigestDay): ScenarioQualityLevel {
  const titles = digest.evidence
    .map((row) => normalizeTitle(asString(row.title)))
    .filter(Boolean);
  const total = titles.length;
  if (total < 2) return "low";

  const counts = new Map<string, number>();
  for (const title of titles) {
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }

  let duplicateCount = 0;
  for (const count of counts.values()) {
    if (count > 1) duplicateCount += count - 1;
  }

  const duplicateRatio = duplicateCount / total;
  if (duplicateCount >= 3 || (total >= 4 && duplicateRatio >= 0.4)) return "high";
  if (duplicateCount >= 1 || (total >= 3 && duplicateRatio >= 0.2)) return "med";
  return "low";
}

function contradictionLevelFromDigest(digest: DigestDay, linkedTopics: string[]): ScenarioQualityLevel {
  const topicSet = new Set(linkedTopics.map((row) => asString(row).toLowerCase()).filter(Boolean));
  if (topicSet.size < 1) return "low";

  const contradictionItems: ContradictionSourceItem[] = [];
  for (const evidence of digest.evidence) {
    const title = asString(evidence.title);
    const snippet = "";
    for (const topicId of evidence.topics) {
      const normalizedTopicId = asString(topicId).toLowerCase();
      if (!topicSet.has(normalizedTopicId)) continue;
      contradictionItems.push({
        topicId: normalizedTopicId,
        topicLabel: normalizedTopicId,
        title,
        snippet,
      });
    }
  }

  const rows = computeTopicContradictions(contradictionItems);
  let strongest: ScenarioQualityLevel = "low";
  for (const row of rows) {
    const current = contradictionToQuality(row.contradictionGrade);
    if (current === "high") return "high";
    if (current === "med") strongest = "med";
  }
  return strongest;
}

function buildUncertaintyLabels(input: {
  dedupeLevel: ScenarioQualityLevel;
  contradictionLevel: ScenarioQualityLevel;
}): string[] {
  const labels: string[] = [];

  if (input.dedupeLevel === "high") {
    labels.push("근거 기사 중복 비중이 높아 해석 가변성이 큽니다.");
  } else if (input.dedupeLevel === "med") {
    labels.push("근거 기사 중복 비중이 있어 해석 가변성이 있습니다.");
  }

  if (input.contradictionLevel === "high") {
    labels.push("토픽 내부 상충 신호가 높아 분기 관찰 필요성이 커집니다.");
  } else if (input.contradictionLevel === "med") {
    labels.push("토픽 내부 상충 신호가 혼재되어 단일 해석 가변성이 있습니다.");
  }

  return labels;
}

export function computeScenarioQualityGates(input: {
  digest: DigestDay;
  linkedTopics: string[];
}): ScenarioQualityGateResult {
  const dedupeLevel = dedupeLevelFromDigest(input.digest);
  const contradictionLevel = contradictionLevelFromDigest(input.digest, input.linkedTopics);
  return {
    dedupeLevel,
    contradictionLevel,
    uncertaintyLabels: buildUncertaintyLabels({ dedupeLevel, contradictionLevel }),
  };
}
