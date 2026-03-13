import type { AssumptionsSnapshot } from "@/lib/planning/assumptions/types";
import type { CorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";

export type DataSourceImpactHealthDetail = {
  label: string;
  value: string;
};

export type DataSourceImpactHealthItem = {
  label: string;
  summaryText: string;
  checkedAt: string | null;
  tone: "ok" | "error";
  statusLabel: "정상" | "주의";
  details?: DataSourceImpactHealthDetail[];
};

export type DataSourceImpactHealthSummary = {
  latestCheckedAt: string | null;
  items: DataSourceImpactHealthItem[];
};

export type DataSourceImpactReadOnlyHealth = {
  tone: "info" | "warning";
  title: string;
  description: string;
  statusLabel: "정상" | "주의";
  checkedAtLabel?: string;
  checkedAt: string | null;
  details: DataSourceImpactHealthDetail[];
};

export type DataSourceImpactOperatorCardSummary = {
  cardId: string;
  label: string;
  readOnly: DataSourceImpactReadOnlyHealth | null;
  healthSummary: DataSourceImpactHealthSummary | null;
};

export const DATA_SOURCE_IMPACT_CARD_LABELS: Record<string, string> = {
  dart: "기업 공시 모니터링",
  planning: "재무설계 기준금리 참고",
};

const DATA_SOURCE_IMPACT_CARD_ORDER = ["dart", "planning"] as const;

function buildDartReadOnlyHealth(input: {
  openDartConfigured: boolean;
  openDartIndexStatus: CorpIndexStatus;
}): DataSourceImpactReadOnlyHealth {
  const generatedAt = input.openDartIndexStatus.meta?.generatedAt ?? null;
  const details: DataSourceImpactHealthDetail[] = [];

  if (typeof input.openDartIndexStatus.meta?.count === "number") {
    details.push({ label: "인덱스 건수", value: `${input.openDartIndexStatus.meta.count}개` });
  }

  if (input.openDartIndexStatus.exists && input.openDartConfigured) {
    return {
      tone: "info",
      title: "운영 최신 기준",
      description: "회사 검색 인덱스 기준입니다. 신규 공시 접수 시각과는 다를 수 있습니다.",
      statusLabel: "정상",
      checkedAtLabel: "검색 인덱스 생성",
      checkedAt: generatedAt,
      details,
    };
  }

  if (input.openDartIndexStatus.exists) {
    return {
      tone: "warning",
      title: "운영 최신 기준",
      description: "회사 검색 인덱스는 있지만 OPENDART 키가 없어 사용자 경로에 바로 연결되지는 않습니다.",
      statusLabel: "주의",
      checkedAtLabel: "검색 인덱스 생성",
      checkedAt: generatedAt,
      details,
    };
  }

  return {
    tone: "warning",
    title: "운영 최신 기준",
    description: input.openDartConfigured
      ? "회사 검색 인덱스가 없어 최신 기준을 함께 보여주지 못합니다."
      : "OPENDART 키와 회사 검색 인덱스가 없어 최신 기준을 확인하지 못합니다.",
    statusLabel: "주의",
    checkedAt: null,
    details: [{ label: "상태", value: "검색 인덱스 없음" }],
  };
}

function buildPlanningReadOnlyHealth(input: {
  planningSnapshot: AssumptionsSnapshot | null;
  planningError?: string;
}): DataSourceImpactReadOnlyHealth {
  if (input.planningSnapshot) {
    const warningsCount = input.planningSnapshot.warnings.length;
    return {
      tone: warningsCount > 0 ? "warning" : "info",
      title: "운영 최신 기준",
      description: "현재 저장된 latest planning 가정 스냅샷 기준입니다.",
      statusLabel: warningsCount > 0 ? "주의" : "정상",
      checkedAtLabel: "최신 동기화",
      checkedAt: input.planningSnapshot.fetchedAt,
      details: [
        { label: "스냅샷 기준일", value: input.planningSnapshot.asOf },
        ...(warningsCount > 0 ? [{ label: "경고", value: `${warningsCount}건` }] : []),
      ],
    };
  }

  return {
    tone: "warning",
    title: "운영 최신 기준",
    description: input.planningError
      ? "latest planning 스냅샷을 읽지 못했습니다. assumptions 동기화 상태를 확인하세요."
      : "저장된 latest planning 스냅샷이 없습니다. assumptions 동기화 상태를 확인하세요.",
    statusLabel: "주의",
    checkedAt: null,
    details: [{ label: "상태", value: input.planningError ? "스냅샷 읽기 실패" : "최신 스냅샷 없음" }],
  };
}

function buildDartHealthSummary(input: {
  openDartConfigured: boolean;
  dartStatus: CorpIndexStatus;
}): DataSourceImpactHealthSummary {
  const details = typeof input.dartStatus.meta?.count === "number"
    ? [{ label: "건수", value: `${input.dartStatus.meta.count}개` }]
    : [];

  if (input.dartStatus.exists && input.openDartConfigured) {
    return {
      latestCheckedAt: input.dartStatus.meta?.generatedAt ?? null,
      items: [
        {
          label: "corpCodes 인덱스",
          summaryText: "DART 검색에 쓰는 회사 인덱스를 확인했습니다.",
          checkedAt: input.dartStatus.meta?.generatedAt ?? null,
          tone: "ok",
          statusLabel: "정상",
          ...(details.length > 0 ? { details } : {}),
        },
      ],
    };
  }

  if (input.dartStatus.exists) {
    return {
      latestCheckedAt: input.dartStatus.meta?.generatedAt ?? null,
      items: [
        {
          label: "corpCodes 인덱스",
          summaryText: "검색 인덱스는 있지만 OPENDART 키가 없어 사용자 경로에 바로 연결되지는 않습니다.",
          checkedAt: input.dartStatus.meta?.generatedAt ?? null,
          tone: "error",
          statusLabel: "주의",
          ...(details.length > 0 ? { details } : {}),
        },
      ],
    };
  }

  if (!input.openDartConfigured) {
    return {
      latestCheckedAt: null,
      items: [
        {
          label: "corpCodes 인덱스",
          summaryText: "OPENDART 키가 없어 최신 인덱스를 다시 확인하지 못했습니다.",
          checkedAt: null,
          tone: "error",
          statusLabel: "주의",
        },
      ],
    };
  }

  return {
    latestCheckedAt: null,
    items: [
      {
        label: "corpCodes 인덱스",
        summaryText: "아직 인덱스가 없습니다. 아래 OpenDART 카드에서 상태 새로고침 또는 인덱스 생성을 확인하세요.",
        checkedAt: null,
        tone: "error",
        statusLabel: "주의",
      },
    ],
  };
}

function buildPlanningHealthSummary(input: {
  planningSnapshot: AssumptionsSnapshot | null;
  planningError?: string;
}): DataSourceImpactHealthSummary {
  if (input.planningSnapshot) {
    const warningsCount = input.planningSnapshot.warnings.length;
    const details: DataSourceImpactHealthDetail[] = [
      { label: "기준일", value: input.planningSnapshot.asOf },
      ...(warningsCount > 0 ? [{ label: "경고", value: `${warningsCount}건` }] : []),
    ];

    return {
      latestCheckedAt: input.planningSnapshot.fetchedAt,
      items: [
        {
          label: "latest 가정 스냅샷",
          summaryText: `기준일 ${input.planningSnapshot.asOf}`,
          checkedAt: input.planningSnapshot.fetchedAt,
          tone: warningsCount > 0 ? "error" : "ok",
          statusLabel: warningsCount > 0 ? "주의" : "정상",
          details,
        },
      ],
    };
  }

  return {
    latestCheckedAt: null,
    items: [
      {
        label: "latest 가정 스냅샷",
        summaryText: input.planningError
          ? `latest snapshot 확인 실패: ${input.planningError}`
          : "latest snapshot이 없습니다. planning 계산 전에 동기화 상태를 확인하세요.",
        checkedAt: null,
        tone: "error",
        statusLabel: "주의",
      },
    ],
  };
}

export function buildDataSourceImpactHealthSummaryMap(input: {
  openDartConfigured?: boolean;
  dartStatus: CorpIndexStatus;
  planningSnapshot: AssumptionsSnapshot | null;
  planningError?: string;
}): Partial<Record<"dart" | "planning", DataSourceImpactHealthSummary>> {
  return {
    dart: buildDartHealthSummary({
      openDartConfigured: input.openDartConfigured ?? true,
      dartStatus: input.dartStatus,
    }),
    planning: buildPlanningHealthSummary({
      planningSnapshot: input.planningSnapshot,
      ...(input.planningError ? { planningError: input.planningError } : {}),
    }),
  };
}

export function buildDataSourceImpactReadOnlyHealth(input: {
  openDartConfigured: boolean;
  openDartIndexStatus: CorpIndexStatus;
  planningSnapshot: AssumptionsSnapshot | null;
  planningError?: string;
}): Partial<Record<"dart" | "planning", DataSourceImpactReadOnlyHealth>> {
  return {
    dart: buildDartReadOnlyHealth({
      openDartConfigured: input.openDartConfigured,
      openDartIndexStatus: input.openDartIndexStatus,
    }),
    planning: buildPlanningReadOnlyHealth({
      planningSnapshot: input.planningSnapshot,
      ...(input.planningError ? { planningError: input.planningError } : {}),
    }),
  };
}

export function buildDataSourceImpactOperatorCardSummaries(input: {
  impactHealthByCardId?: Partial<Record<string, DataSourceImpactHealthSummary>>;
  impactReadOnlyByCardId?: Partial<Record<string, DataSourceImpactReadOnlyHealth>>;
}): DataSourceImpactOperatorCardSummary[] {
  const impactHealthByCardId = input.impactHealthByCardId ?? {};
  const impactReadOnlyByCardId = input.impactReadOnlyByCardId ?? {};
  const cardIds = Array.from(new Set([
    ...Object.keys(impactHealthByCardId),
    ...Object.keys(impactReadOnlyByCardId),
  ]));

  return cardIds
    .sort((left, right) => {
      const leftRank = DATA_SOURCE_IMPACT_CARD_ORDER.indexOf(left as typeof DATA_SOURCE_IMPACT_CARD_ORDER[number]);
      const rightRank = DATA_SOURCE_IMPACT_CARD_ORDER.indexOf(right as typeof DATA_SOURCE_IMPACT_CARD_ORDER[number]);
      const safeLeftRank = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
      const safeRightRank = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;
      if (safeLeftRank !== safeRightRank) return safeLeftRank - safeRightRank;
      return left.localeCompare(right);
    })
    .map((cardId) => ({
      cardId,
      label: DATA_SOURCE_IMPACT_CARD_LABELS[cardId] ?? cardId,
      readOnly: impactReadOnlyByCardId[cardId] ?? null,
      healthSummary: impactHealthByCardId[cardId] ?? null,
    }));
}
