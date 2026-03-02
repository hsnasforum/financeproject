import type { PlannerInput, PlannerMetricLine, PlannerResult } from "@/lib/planner/types";
import type { SavedRecommendRun } from "@/lib/recommend/savedRunsStore";

export type PlannerLastSnapshot = {
  savedAt: string;
  input: PlannerInput;
  result: PlannerResult;
};

export type ReportModel = {
  generatedAt: string;
  disclaimer: string;
  dataAsOfNote: string;
  overview: {
    runId: string | null;
    recommendSavedAt: string | null;
    plannerSavedAt: string | null;
    recommendationCount: number;
  };
  planner: {
    available: boolean;
    message: string;
    snapshot: PlannerLastSnapshot | null;
  };
  recommendation: {
    available: boolean;
    message: string;
    run: SavedRecommendRun | null;
  };
  disclosures: {
    included: boolean;
    source: "none" | "live" | "digest";
    available: boolean;
    message: string;
    entries: ReportDisclosureEntry[];
    digest: ReportDisclosureDigest | null;
  };
};

export type ReportDisclosureItem = {
  corpCode: string;
  corpName?: string;
  reportName?: string;
  receiptNo?: string;
  receiptDate?: string;
  viewerUrl?: string;
};

export type ReportDisclosureEntry = {
  corpCode: string;
  corpName?: string;
  checkedAt?: string;
  newCount?: number;
  items: ReportDisclosureItem[];
};

export type ReportDisclosureDigestHighlight = ReportDisclosureItem & {
  representativeTitle?: string;
  representativeLevel?: "high" | "mid" | "low";
  representativeScore?: number;
  count?: number;
  classification?: {
    categoryId?: string;
    categoryLabel?: string;
    score?: number;
    level?: "high" | "mid" | "low";
    signals?: string[];
    reason?: string;
  };
};

export type ReportDisclosureDigestCompany = {
  corpCode: string;
  corpName?: string;
  checkedAt?: string;
  totalCount?: number;
  newCount?: number;
  summaryLines?: string[];
  clusters?: ReportDisclosureDigestHighlight[];
  highlights?: ReportDisclosureDigestHighlight[];
  latestItems?: ReportDisclosureDigestHighlight[];
  error?: string;
};

export type ReportDisclosureDigest = {
  generatedAt?: string;
  summary?: {
    companies?: number;
    totalItems?: number;
    totalNew?: number;
    errors?: number;
    skippedReason?: string;
  };
  topHighlights?: ReportDisclosureDigestHighlight[];
  companies?: ReportDisclosureDigestCompany[];
};

const DEFAULT_DISCLAIMER =
  "면책: 본 리포트는 공공/저장 데이터와 규칙 기반 계산을 요약한 참고 자료이며, 수익·원금·가입 승인·혜택 지급을 보장하지 않습니다.";

const DEFAULT_AS_OF_NOTE =
  "데이터 기준시각: 추천은 run.savedAt, 플래너는 planner.savedAt(저장 시각)을 기준으로 하며 최신 실시간 정보를 보장하지 않습니다.";

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return String(value);
}

function digestHighlightLevel(item: ReportDisclosureDigestHighlight): string {
  return item.representativeLevel ?? item.classification?.level ?? "low";
}

function digestHighlightScore(item: ReportDisclosureDigestHighlight): number {
  return item.representativeScore ?? item.classification?.score ?? 0;
}

function digestHighlightTitle(item: ReportDisclosureDigestHighlight): string {
  return item.representativeTitle ?? item.reportName ?? "(제목 없음)";
}

function metricToLine(metric: PlannerMetricLine): string {
  const unit = metric.unit ? ` ${metric.unit}` : "";
  return `- ${metric.label}: ${formatNumber(metric.value)}${unit}`;
}

export function buildReportModel(input: {
  plannerSnapshot: PlannerLastSnapshot | null;
  savedRun: SavedRecommendRun | null;
  includeDisclosures?: boolean;
  includeDisclosuresFromDigest?: boolean;
  disclosures?: ReportDisclosureEntry[] | null;
  disclosureDigest?: ReportDisclosureDigest | null;
  disclosuresError?: string | null;
  generatedAt?: string;
}): ReportModel {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const run = input.savedRun;
  const plannerSnapshot = input.plannerSnapshot;
  const includeDisclosures = input.includeDisclosures === true;
  const includeDisclosuresFromDigest = input.includeDisclosuresFromDigest === true;
  const disclosures = Array.isArray(input.disclosures) ? input.disclosures : [];
  const disclosureDigest = input.disclosureDigest && typeof input.disclosureDigest === "object"
    ? input.disclosureDigest
    : null;
  const disclosuresError = typeof input.disclosuresError === "string" ? input.disclosuresError : "";
  const digestCompanies = Array.isArray(disclosureDigest?.companies) ? disclosureDigest?.companies : [];
  const digestTopHighlights = Array.isArray(disclosureDigest?.topHighlights) ? disclosureDigest?.topHighlights : [];
  const digestAvailable = digestCompanies.length > 0 || digestTopHighlights.length > 0;
  const source: "none" | "live" | "digest" = includeDisclosuresFromDigest
    ? "digest"
    : includeDisclosures
      ? "live"
      : "none";
  const included = includeDisclosures || includeDisclosuresFromDigest;
  const available = includeDisclosuresFromDigest
    ? digestAvailable
    : includeDisclosures && disclosures.length > 0;
  const message = includeDisclosuresFromDigest
    ? (disclosuresError || (digestAvailable
      ? "로컬 digest 기반 공시 핵심 변화를 포함했습니다."
      : "로컬 digest를 찾지 못했거나 비어 있어 공시 섹션을 생략했습니다."))
    : includeDisclosures
      ? (disclosuresError || (disclosures.length > 0
        ? "관심기업 공시 목록을 포함했습니다."
        : "공시 데이터를 찾지 못해 섹션을 생략했습니다."))
      : "공시 섹션이 비활성화되었습니다.";

  return {
    generatedAt,
    disclaimer: DEFAULT_DISCLAIMER,
    dataAsOfNote: DEFAULT_AS_OF_NOTE,
    overview: {
      runId: run?.runId ?? null,
      recommendSavedAt: run?.savedAt ?? null,
      plannerSavedAt: plannerSnapshot?.savedAt ?? null,
      recommendationCount: run?.items.length ?? 0,
    },
    planner: {
      available: Boolean(plannerSnapshot),
      message: plannerSnapshot
        ? "플래너 스냅샷을 포함했습니다."
        : "플래너 스냅샷이 없어 이 섹션은 안내 문구로 대체되었습니다.",
      snapshot: plannerSnapshot,
    },
    recommendation: {
      available: Boolean(run),
      message: run
        ? "저장된 추천 실행을 포함했습니다."
        : "저장된 추천 실행(runId)을 찾지 못해 이 섹션은 안내 문구로 대체되었습니다.",
      run,
    },
    disclosures: {
      included,
      source,
      available,
      message,
      entries: includeDisclosures ? disclosures : [],
      digest: includeDisclosuresFromDigest
        ? {
            generatedAt: disclosureDigest?.generatedAt,
            summary: disclosureDigest?.summary,
            topHighlights: digestTopHighlights,
            companies: digestCompanies,
          }
        : null,
    },
  };
}

export function toMarkdown(model: ReportModel): string {
  const lines: string[] = [];
  lines.push("# 재무설계 + 추천 리포트");
  lines.push("");
  lines.push(`- 생성시각: ${model.generatedAt}`);
  lines.push(`- 추천 실행 ID: ${model.overview.runId ?? "없음"}`);
  lines.push(`- 추천 저장시각: ${model.overview.recommendSavedAt ?? "없음"}`);
  lines.push(`- 플래너 저장시각: ${model.overview.plannerSavedAt ?? "없음"}`);
  lines.push(`- 추천 항목 수: ${model.overview.recommendationCount}`);
  lines.push("");
  lines.push(`- ${model.disclaimer}`);
  lines.push(`- ${model.dataAsOfNote}`);
  lines.push("");

  lines.push("## 플래너 요약");
  if (!model.planner.available || !model.planner.snapshot) {
    lines.push(model.planner.message);
  } else {
    const planner = model.planner.snapshot;
    lines.push(`- 저장시각: ${planner.savedAt}`);
    lines.push(`- 월소득(세후): ${planner.input.monthlyIncomeNet}`);
    lines.push(`- 월고정지출: ${planner.input.monthlyFixedExpenses}`);
    lines.push(`- 월변동지출: ${planner.input.monthlyVariableExpenses}`);
    lines.push(`- 현금성자산: ${planner.input.liquidAssets}`);
    lines.push("");
    lines.push("### 핵심 지표");
    if (planner.result.metrics.length === 0) {
      lines.push("- 지표 없음");
    } else {
      planner.result.metrics.forEach((metric) => lines.push(metricToLine(metric)));
    }
    lines.push("");
    lines.push("### 우선 액션");
    if (planner.result.actions.length === 0) {
      lines.push("- 액션 없음");
    } else {
      planner.result.actions.forEach((action) => {
        lines.push(`- [${action.priority}] ${action.title}: ${action.action}`);
      });
    }
    lines.push("");
    lines.push("### 경고");
    if (planner.result.warnings.length === 0) {
      lines.push("- 없음");
    } else {
      planner.result.warnings.forEach((warning) => lines.push(`- ${warning}`));
    }
  }
  lines.push("");

  lines.push("## 추천 요약");
  if (!model.recommendation.available || !model.recommendation.run) {
    lines.push(model.recommendation.message);
  } else {
    const run = model.recommendation.run;
    lines.push(`- 실행 ID: ${run.runId}`);
    lines.push(`- 저장시각: ${run.savedAt}`);
    lines.push(`- 프로필: ${run.profile.purpose} / ${run.profile.kind} / topN ${run.profile.topN}`);
    lines.push("");
    lines.push("| rank | unifiedId | provider | product | kind | termMonths | appliedRate | finalScore |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    run.items.forEach((item) => {
      lines.push(`| ${item.rank} | ${item.unifiedId} | ${item.providerName} | ${item.productName} | ${item.kind} | ${item.termMonths ?? "-"} | ${item.appliedRate ?? "-"} | ${item.finalScore} |`);
    });
  }
  lines.push("");

  if (model.disclosures.included) {
    lines.push(model.disclosures.source === "digest" ? "## 공시 핵심 변화 (로컬 digest 기반)" : "## 공시 모니터링 요약");
    if (!model.disclosures.available || (model.disclosures.source === "digest" && !model.disclosures.digest)) {
      lines.push(model.disclosures.message);
    } else if (model.disclosures.source === "digest" && model.disclosures.digest) {
      const digest = model.disclosures.digest;
      lines.push(`- digest 생성시각: ${digest.generatedAt ?? "-"}`);
      lines.push(
        `- 요약: companies=${digest.summary?.companies ?? "-"}, totalItems=${digest.summary?.totalItems ?? "-"}, totalNew=${digest.summary?.totalNew ?? "-"}, errors=${digest.summary?.errors ?? "-"}`,
      );
      lines.push("");
      lines.push("### 핵심 Top");
      if (!Array.isArray(digest.topHighlights) || digest.topHighlights.length === 0) {
        lines.push("- 핵심 변화 없음");
      } else {
        digest.topHighlights.slice(0, 10).forEach((item) => {
          const level = digestHighlightLevel(item).toUpperCase();
          const score = digestHighlightScore(item);
          const title = digestHighlightTitle(item);
          const count = typeof item.count === "number" ? ` (${item.count}건)` : "";
          lines.push(
            `- [${level} ${score}] ${item.corpName ?? item.corpCode ?? "-"} ${item.receiptDate ?? "-"} ${title}${count}`,
          );
        });
      }
      lines.push("");
      lines.push("### 기업별 5줄 요약");
      const companies = Array.isArray(digest.companies) ? digest.companies : [];
      if (companies.length === 0) {
        lines.push("- 기업 요약 없음");
      } else {
        companies.forEach((company) => {
          lines.push(`- ${company.corpName ?? company.corpCode} (${company.corpCode})`);
          if (company.error) {
            lines.push(`  - 오류: ${company.error}`);
            return;
          }
          const summaryLines = Array.isArray(company.summaryLines) ? company.summaryLines : [];
          if (summaryLines.length === 0) {
            lines.push("  - 요약 없음");
            return;
          }
          summaryLines.slice(0, 5).forEach((line) => lines.push(`  - ${line}`));
        });
      }
    } else {
      model.disclosures.entries.forEach((entry) => {
        lines.push(`- ${entry.corpName ?? entry.corpCode} (${entry.corpCode})`);
        if (entry.checkedAt) lines.push(`  - 마지막 확인: ${entry.checkedAt}`);
        if (typeof entry.newCount === "number") lines.push(`  - 신규 건수: ${entry.newCount}`);
        if (entry.items.length === 0) {
          lines.push("  - 공시 없음");
        } else {
          entry.items.slice(0, 5).forEach((item) => {
            lines.push(`  - ${item.receiptDate ?? "-"} ${item.reportName ?? "(제목 없음)"} ${item.receiptNo ?? ""}`.trim());
          });
        }
      });
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function toJson(model: ReportModel): string {
  return JSON.stringify(model, null, 2);
}
