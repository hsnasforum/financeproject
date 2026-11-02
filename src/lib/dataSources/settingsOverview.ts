import type { DataSourceImpactReadOnlyHealth } from "./impactHealth";
import type { DataSourceUserImpactCard } from "./userImpact";

export type DataSourceSettingsAttentionItem = {
  id: string;
  label: string;
  reason: string;
  statusLabel: "최신 기준 확인" | "연결 오류" | "일부 설정" | "설정 확인";
  tone: "warning" | "missing";
};

export type DataSourceSettingsOverview = {
  totalImpactCount: number;
  readyImpactCount: number;
  warningCount: number;
  sourceAttentionCount: number;
  attentionItems: DataSourceSettingsAttentionItem[];
};

type SettingsSource = {
  id: string;
  label: string;
  status: { state: "configured" | "missing" | "error" };
};

export function buildDataSourceSettingsOverview(input: {
  cards: DataSourceUserImpactCard[];
  readOnlyHealthByCardId: Partial<Record<string, DataSourceImpactReadOnlyHealth>>;
  sources: SettingsSource[];
}): DataSourceSettingsOverview {
  const impactAttentionItems = input.cards.flatMap<DataSourceSettingsAttentionItem>((card) => {
    const health = input.readOnlyHealthByCardId[card.id];
    if (health?.tone === "warning") {
      return [{
        id: card.id,
        label: card.title,
        reason: health.description,
        statusLabel: "최신 기준 확인",
        tone: "warning",
      }];
    }
    if (card.state === "partial") {
      return [{
        id: card.id,
        label: card.title,
        reason: "일부 연결만 설정되어 결과 범위가 줄어들 수 있습니다.",
        statusLabel: "일부 설정",
        tone: "missing",
      }];
    }
    if (card.state === "missing") {
      return [{
        id: card.id,
        label: card.title,
        reason: "연결 정보가 없어 기본 안내 중심으로 표시될 수 있습니다.",
        statusLabel: "설정 확인",
        tone: "missing",
      }];
    }
    return [];
  });
  const sourceErrorItems = input.sources
    .filter((source) => source.status.state === "error")
    .map<DataSourceSettingsAttentionItem>((source) => ({
      id: `source:${source.id}`,
      label: source.label,
      reason: "최근 상태 확인에서 연결 오류가 확인되어 관련 결과가 늦거나 비어 보일 수 있습니다.",
      statusLabel: "연결 오류",
      tone: "warning",
    }));
  const attentionItems = [...impactAttentionItems, ...sourceErrorItems];

  attentionItems.sort((left, right) => {
    if (left.tone === right.tone) return 0;
    return left.tone === "warning" ? -1 : 1;
  });

  return {
    totalImpactCount: input.cards.length,
    readyImpactCount: input.cards.filter((card) => card.state === "ready").length,
    warningCount: attentionItems.filter((item) => item.tone === "warning").length,
    sourceAttentionCount: input.sources.filter((source) => source.status.state !== "configured").length,
    attentionItems,
  };
}
