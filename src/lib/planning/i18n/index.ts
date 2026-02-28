import { ko as koErrors } from "../v2/messages.ko";

export type Locale = "ko-KR" | "en-US";

export const DEFAULT_LOCALE: Locale = "ko-KR";

const enErrors: Record<keyof typeof koErrors, string> = {
  INPUT: "Input is invalid.",
  SNAPSHOT_NOT_FOUND: "The requested snapshot was not found.",
  SNAPSHOT_MISSING: "No latest snapshot was found, so defaults were used.",
  BUDGET_EXCEEDED: "Requested workload is too large. Reduce horizon or paths.",
  DISABLED: "This feature is disabled by server policy.",
  LOCAL_ONLY: "This endpoint is available only in local environment.",
  CSRF: "Request blocked (CSRF). Refresh page and try again.",
  INTERNAL: "An internal error occurred while processing the request.",
};

export const messages: Record<Locale, Record<string, string>> = {
  "ko-KR": {
    ...koErrors,
    PLANNING_TITLE: "재무설계 v2",
    PLANNING_DESC: "프로필 선택/실행/저장/비교까지 사용자 흐름으로 실행합니다.",
    DISCLAIMER_TITLE: "가정/확률 결과는 보장값이 아닙니다.",
    DISCLAIMER_BODY:
      "결과와 후보 목록은 비교/점검용이며 특정 상품 가입 권유가 아닙니다. 스냅샷 기준일(asOf)과 override를 함께 확인하세요.",
    CHARTS_HEADER: "Charts (Net Worth / Cash / Total Debt)",
    CHART_NOT_AVAILABLE: "차트는 전체 타임라인 또는 key timeline points가 있을 때 표시됩니다.",
    CHART_KEY_MODE_NOTICE: "전체 타임라인이 없어 key points 기반 미니 차트로 표시합니다.",
    CHART_LABEL_NET_WORTH: "순자산",
    CHART_LABEL_CASH: "현금",
    CHART_LABEL_TOTAL_DEBT: "총부채",
    CHART_SUMMARY_POINTS: "시작/중간/마지막",
    CHART_SUMMARY_MIN_MAX: "최저/최고",
    SUMMARY_LABEL_GENERATED_AT: "generatedAt",
    SUMMARY_LABEL_SNAPSHOT_ID: "snapshot id",
    SUMMARY_LABEL_SNAPSHOT_AS_OF: "snapshot asOf",
    SUMMARY_LABEL_SNAPSHOT_FETCHED_AT: "snapshot fetchedAt",
    SUMMARY_LABEL_HEALTH_WARNINGS: "health warnings",
    SUMMARY_LABEL_HEALTH_CRITICAL: "health critical",
    I18N_SAMPLE_VAR: "샘플 {name}",
  },
  "en-US": {
    ...enErrors,
    PLANNING_TITLE: "Planning v2",
    PLANNING_DESC: "Run profile selection, simulation, save, and compare flow.",
    DISCLAIMER_TITLE: "Assumptions and probabilities are not guarantees.",
    DISCLAIMER_BODY:
      "Results and product candidates are for comparison only, not buy recommendations. Always review snapshot asOf and overrides.",
    CHARTS_HEADER: "Charts (Net Worth / Cash / Total Debt)",
    CHART_NOT_AVAILABLE: "Charts are shown only when full timeline or key timeline points are available.",
    CHART_KEY_MODE_NOTICE: "Full timeline is unavailable, so key-point mini charts are shown.",
    CHART_LABEL_NET_WORTH: "Net Worth",
    CHART_LABEL_CASH: "Cash",
    CHART_LABEL_TOTAL_DEBT: "Total Debt",
    CHART_SUMMARY_POINTS: "Start / Mid / End",
    CHART_SUMMARY_MIN_MAX: "Min / Max",
    SUMMARY_LABEL_GENERATED_AT: "generatedAt",
    SUMMARY_LABEL_SNAPSHOT_ID: "snapshot id",
    SUMMARY_LABEL_SNAPSHOT_AS_OF: "snapshot asOf",
    SUMMARY_LABEL_SNAPSHOT_FETCHED_AT: "snapshot fetchedAt",
    SUMMARY_LABEL_HEALTH_WARNINGS: "health warnings",
    SUMMARY_LABEL_HEALTH_CRITICAL: "health critical",
    I18N_SAMPLE_VAR: "Sample {name}",
  },
};

export function normalizeLocale(value?: string | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  const normalized = value.trim().toLowerCase();
  if (normalized === "en" || normalized === "en-us") return "en-US";
  if (normalized === "ko" || normalized === "ko-kr") return "ko-KR";
  return DEFAULT_LOCALE;
}

export function resolvePlanningLocale(queryLang?: string | null, envLocale?: string | null): Locale {
  if (queryLang && queryLang.trim().length > 0) {
    return normalizeLocale(queryLang);
  }
  return normalizeLocale(envLocale ?? undefined);
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const catalog = messages[locale] ?? messages[DEFAULT_LOCALE];
  const fallbackCatalog = messages[DEFAULT_LOCALE];
  const template = catalog[key] ?? fallbackCatalog[key] ?? key;
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (!(name in vars)) return whole;
    return String(vars[name]);
  });
}
