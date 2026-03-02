import { REASON_CODES } from "../core/v2/types";
import { REASON_CODE_MESSAGES_KO } from "../core/v2/warningsCatalog.ko";
import { WARNING_GLOSSARY_KO } from "../v2/insights/warningGlossary.ko";
import { WARNING_SEVERITY_BY_CODE } from "../v2/report/warningsAggregate";
import { renderCopyTemplate } from "./copyTemplates";

export type WarningSeverityHint = "info" | "warn" | "critical";

export type WarningCatalogEntry = {
  title: string;
  plainDescription: string;
  severityHint: WarningSeverityHint;
  suggestedActionId?: string;
};

type WarningCatalogMap = Record<string, WarningCatalogEntry>;

const ACTION_HINT_BY_CODE: Record<string, string> = {
  NEGATIVE_CASHFLOW: "FIX_NEGATIVE_CASHFLOW",
  HIGH_DEBT_SERVICE: "REDUCE_DEBT_SERVICE",
  HIGH_DEBT_RATIO: "REDUCE_DEBT_SERVICE",
  DEBT_NEGATIVE_AMORTIZATION: "REDUCE_DEBT_SERVICE",
  NEGATIVE_AMORTIZATION_RISK: "REDUCE_DEBT_SERVICE",
  DSR_HIGH_CRITICAL: "REDUCE_DEBT_SERVICE",
  DSR_HIGH_WARN: "REDUCE_DEBT_SERVICE",
  CONTRIBUTION_SKIPPED: "FIX_NEGATIVE_CASHFLOW",
  GOAL_MISSED: "COVER_LUMP_SUM_GOAL",
  EMERGENCY_FUND_DRAWDOWN: "BUILD_EMERGENCY_FUND",
  EMERGENCY_FUND_SHORT: "BUILD_EMERGENCY_FUND",
  RETIREMENT_SHORT: "IMPROVE_RETIREMENT_PLAN",
  SNAPSHOT_MISSING: "SET_ASSUMPTIONS_REVIEW",
  SNAPSHOT_STALE: "SET_ASSUMPTIONS_REVIEW",
  SNAPSHOT_VERY_STALE: "SET_ASSUMPTIONS_REVIEW",
  OPTIMISTIC_RETURN: "SET_ASSUMPTIONS_REVIEW",
  OPTIMISTIC_RETURN_HIGH: "SET_ASSUMPTIONS_REVIEW",
  RISK_ASSUMPTION_MISMATCH: "SET_ASSUMPTIONS_REVIEW",
  RISK_ASSUMPTION_MISMATCH_LOW: "SET_ASSUMPTIONS_REVIEW",
};

const EXTRA_WARNING_ENTRIES: WarningCatalogMap = {
  NEGATIVE_AMORTIZATION_RISK: {
    title: "원금 미상환 위험",
    plainDescription: "최소 납입액이 월 이자를 충분히 커버하지 못할 수 있습니다.",
    severityHint: "warn",
    suggestedActionId: "REDUCE_DEBT_SERVICE",
  },
  DSR_HIGH_CRITICAL: {
    title: "DSR 과다(치명)",
    plainDescription: "부채상환비율이 매우 높아 현금흐름 압박이 큽니다.",
    severityHint: "critical",
    suggestedActionId: "REDUCE_DEBT_SERVICE",
  },
  DSR_HIGH_WARN: {
    title: "DSR 높음(주의)",
    plainDescription: "부채상환비율이 높아 지출 변동에 취약할 수 있습니다.",
    severityHint: "warn",
    suggestedActionId: "REDUCE_DEBT_SERVICE",
  },
  RISK_ASSUMPTION_MISMATCH: {
    title: "위험성향-가정 불일치",
    plainDescription: "위험성향 대비 수익률 가정이 공격적일 수 있습니다.",
    severityHint: "critical",
    suggestedActionId: "SET_ASSUMPTIONS_REVIEW",
  },
  RISK_ASSUMPTION_MISMATCH_LOW: {
    title: "위험성향-가정 차이",
    plainDescription: "위험성향 대비 수익률 가정이 보수적일 수 있습니다.",
    severityHint: "info",
    suggestedActionId: "SET_ASSUMPTIONS_REVIEW",
  },
  OPTIMISTIC_RETURN: {
    title: "수익률 가정 높음",
    plainDescription: "입력한 기대수익률이 다소 낙관적으로 설정되었을 수 있습니다.",
    severityHint: "warn",
    suggestedActionId: "SET_ASSUMPTIONS_REVIEW",
  },
};

function toSeverityHint(code: string): WarningSeverityHint {
  const mapped = WARNING_SEVERITY_BY_CODE[code as keyof typeof WARNING_SEVERITY_BY_CODE];
  if (mapped === "critical" || mapped === "warn" || mapped === "info") return mapped;
  if (code === "DSR_HIGH_CRITICAL" || code === "OPTIMISTIC_RETURN_HIGH" || code === "SNAPSHOT_VERY_STALE") return "critical";
  if (code === "DSR_HIGH_WARN" || code === "NEGATIVE_AMORTIZATION_RISK") return "warn";
  return "warn";
}

function buildWarningCatalog(): WarningCatalogMap {
  const fromReasonMessages: WarningCatalogMap = Object.fromEntries(
    REASON_CODES.map((code) => [
      code,
      {
        title: code,
        plainDescription: REASON_CODE_MESSAGES_KO[code],
        severityHint: toSeverityHint(code),
        ...(ACTION_HINT_BY_CODE[code] ? { suggestedActionId: ACTION_HINT_BY_CODE[code] } : {}),
      } satisfies WarningCatalogEntry,
    ]),
  );

  const fromGlossary: WarningCatalogMap = Object.fromEntries(
    Object.entries(WARNING_GLOSSARY_KO).map(([code, glossary]) => [
      code,
      {
        title: glossary.title,
        plainDescription: glossary.suggestion,
        severityHint: toSeverityHint(code),
        ...(ACTION_HINT_BY_CODE[code] ? { suggestedActionId: ACTION_HINT_BY_CODE[code] } : {}),
      } satisfies WarningCatalogEntry,
    ]),
  );

  return {
    ...fromReasonMessages,
    ...fromGlossary,
    ...EXTRA_WARNING_ENTRIES,
  };
}

const WARNING_CATALOG: WarningCatalogMap = buildWarningCatalog();

export const PLANNING_EMITTED_WARNING_CODES = [
  ...REASON_CODES,
  "SNAPSHOT_MISSING",
  "SNAPSHOT_STALE",
  "SNAPSHOT_VERY_STALE",
  "OPTIMISTIC_RETURN",
  "OPTIMISTIC_RETURN_HIGH",
  "RISK_ASSUMPTION_MISMATCH",
  "RISK_ASSUMPTION_MISMATCH_LOW",
  "NEGATIVE_AMORTIZATION_RISK",
  "DSR_HIGH_CRITICAL",
  "DSR_HIGH_WARN",
] as const;

export const PLANNING_WARNING_UNKNOWN_WHITELIST = [
  "UNKNOWN",
] as const;

export type PlanningKnownWarningCode = (typeof PLANNING_EMITTED_WARNING_CODES)[number];
export type PlanningUnknownWhitelistedCode = (typeof PLANNING_WARNING_UNKNOWN_WHITELIST)[number];

export function listWarningCatalogCodes(): string[] {
  return Object.keys(WARNING_CATALOG).sort((a, b) => a.localeCompare(b));
}

export function hasWarningCatalog(code: string): boolean {
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!normalized) return false;
  return Object.hasOwn(WARNING_CATALOG, normalized);
}

export function warningFallbackMessage(code: string): string {
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  return renderCopyTemplate("warning.fallback.message", { code: normalized || "UNKNOWN" });
}

export function resolveWarningCatalog(code: string): WarningCatalogEntry {
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!normalized) {
    return {
      title: renderCopyTemplate("warning.unknown.title", { code: "UNKNOWN" }),
      plainDescription: renderCopyTemplate("warning.unknown.description"),
      severityHint: "warn",
    };
  }

  const resolved = WARNING_CATALOG[normalized];
  if (resolved) return resolved;

  return {
    title: renderCopyTemplate("warning.unknown.title", { code: normalized }),
    plainDescription: renderCopyTemplate("warning.unknown.description"),
    severityHint: toSeverityHint(normalized),
  };
}
