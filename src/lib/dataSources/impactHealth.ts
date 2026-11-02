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

function hasUsableDartIndex(status: CorpIndexStatus): boolean {
  return status.exists && status.usable !== false;
}

function getDartFreshnessDetail(status: CorpIndexStatus): DataSourceImpactHealthDetail {
  if (!hasUsableDartIndex(status)) {
    return {
      label: "인덱스 상태",
      value: status.exists ? "파일 읽기 실패" : "검색 인덱스 없음",
    };
  }
  const freshness = status.freshness;
  if (freshness?.state === "fresh") {
    return { label: "인덱스 상태", value: "사용 가능" };
  }
  if (freshness?.state === "stale") {
    return {
      label: "인덱스 상태",
      value: `${freshness.ageDays ?? "-"}일 경과 · ${freshness.thresholdDays}일 기준 오래됨`,
    };
  }
  return { label: "인덱스 상태", value: "최근 생성 시점 확인 없음" };
}

function getDartFreshnessDescription(status: CorpIndexStatus): string {
  if (!hasUsableDartIndex(status)) {
    return status.exists
      ? "회사 검색 인덱스 파일을 읽지 못해 최신 기준을 제공하지 못합니다."
      : "회사 검색 인덱스가 없어 최신 기준을 제공하지 못합니다.";
  }
  const freshness = status.freshness;
  if (freshness?.state === "stale") {
    return `회사 검색 인덱스는 사용할 수 있지만 생성 후 ${freshness.ageDays ?? "-"}일이 지나 ${freshness.thresholdDays}일 기준보다 오래됐습니다.`;
  }
  if (freshness?.state !== "fresh") {
    return "회사 검색 인덱스는 있지만 생성 시점을 확인할 수 없어 최신 여부를 판단하지 못했습니다.";
  }
  return "회사 검색 인덱스 기준입니다. 신규 공시 접수 시각과는 다를 수 있습니다.";
}

function getDartFreshnessCheckedAt(status: CorpIndexStatus): string | null {
  return status.freshness?.state === "fresh" || status.freshness?.state === "stale"
    ? status.meta?.generatedAt ?? null
    : null;
}

function buildDartReadOnlyHealth(input: {
  openDartConfigured: boolean;
  openDartIndexStatus: CorpIndexStatus;
}): DataSourceImpactReadOnlyHealth {
  const details: DataSourceImpactHealthDetail[] = [];

  if (typeof input.openDartIndexStatus.meta?.count === "number") {
    details.push({ label: "인덱스 건수", value: `${input.openDartIndexStatus.meta.count}개` });
  }
  if (input.openDartIndexStatus.exists) {
    details.push(getDartFreshnessDetail(input.openDartIndexStatus));
  }

  if (hasUsableDartIndex(input.openDartIndexStatus) && input.openDartConfigured) {
    const freshnessIsFresh = input.openDartIndexStatus.freshness?.state === "fresh";
    return {
      tone: freshnessIsFresh ? "info" : "warning",
      title: "운영 최신 기준",
      description: getDartFreshnessDescription(input.openDartIndexStatus),
      statusLabel: freshnessIsFresh ? "정상" : "주의",
      checkedAtLabel: "검색 인덱스 생성",
      checkedAt: getDartFreshnessCheckedAt(input.openDartIndexStatus),
      details,
    };
  }

  if (hasUsableDartIndex(input.openDartIndexStatus)) {
    return {
      tone: "warning",
      title: "운영 최신 기준",
      description: `OPENDART 키가 없어 사용자 경로에 바로 연결되지는 않습니다. ${getDartFreshnessDescription(input.openDartIndexStatus)}`,
      statusLabel: "주의",
      checkedAtLabel: "검색 인덱스 생성",
      checkedAt: getDartFreshnessCheckedAt(input.openDartIndexStatus),
      details,
    };
  }

  const indexUnavailableDescription = input.openDartIndexStatus.exists
    ? "회사 검색 인덱스 파일을 읽지 못해 최신 기준을 함께 보여주지 못합니다."
    : "회사 검색 인덱스가 없어 최신 기준을 함께 보여주지 못합니다.";

  return {
    tone: "warning",
    title: "운영 최신 기준",
    description: input.openDartConfigured
      ? indexUnavailableDescription
      : input.openDartIndexStatus.exists
        ? "OPENDART 키가 없고 회사 검색 인덱스 파일도 읽지 못해 최신 기준을 확인하지 못합니다."
        : "OPENDART 키와 회사 검색 인덱스가 없어 최신 기준을 확인하지 못합니다.",
    statusLabel: "주의",
    checkedAt: null,
    details: [{ label: "상태", value: input.openDartIndexStatus.exists ? "인덱스 읽기 실패" : "검색 인덱스 없음" }],
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
  const details: DataSourceImpactHealthDetail[] = [
    ...(typeof input.dartStatus.meta?.count === "number"
      ? [{ label: "건수", value: `${input.dartStatus.meta.count}개` }]
      : []),
    ...(input.dartStatus.exists ? [getDartFreshnessDetail(input.dartStatus)] : []),
  ];

  if (hasUsableDartIndex(input.dartStatus) && input.openDartConfigured) {
    const freshnessIsFresh = input.dartStatus.freshness?.state === "fresh";
    return {
      latestCheckedAt: getDartFreshnessCheckedAt(input.dartStatus),
      items: [
        {
          label: "corpCodes 인덱스",
          summaryText: getDartFreshnessDescription(input.dartStatus),
          checkedAt: getDartFreshnessCheckedAt(input.dartStatus),
          tone: freshnessIsFresh ? "ok" : "error",
          statusLabel: freshnessIsFresh ? "정상" : "주의",
          ...(details.length > 0 ? { details } : {}),
        },
      ],
    };
  }

  if (hasUsableDartIndex(input.dartStatus)) {
    return {
      latestCheckedAt: getDartFreshnessCheckedAt(input.dartStatus),
      items: [
        {
          label: "corpCodes 인덱스",
          summaryText: `OPENDART 키가 없어 사용자 경로에 바로 연결되지는 않습니다. ${getDartFreshnessDescription(input.dartStatus)}`,
          checkedAt: getDartFreshnessCheckedAt(input.dartStatus),
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
          summaryText: input.dartStatus.exists
            ? "OPENDART 키가 없고 회사 검색 인덱스 파일도 읽지 못해 최신 기준을 확인하지 못했습니다."
            : "OPENDART 키가 없어 최신 인덱스를 다시 확인하지 못했습니다.",
          checkedAt: null,
          tone: "error",
          statusLabel: "주의",
          ...(details.length > 0 ? { details } : {}),
        },
      ],
    };
  }

  return {
    latestCheckedAt: null,
    items: [
      {
        label: "corpCodes 인덱스",
        summaryText: input.dartStatus.exists
          ? "회사 검색 인덱스 파일을 읽지 못했습니다. 아래 OpenDART 카드에서 상태 새로고침 또는 인덱스 생성을 확인하세요."
          : "아직 인덱스가 없습니다. 아래 OpenDART 카드에서 상태 새로고침 또는 인덱스 생성을 확인하세요.",
        checkedAt: null,
        tone: "error",
        statusLabel: "주의",
        ...(details.length > 0 ? { details } : {}),
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
