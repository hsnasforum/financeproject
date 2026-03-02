import { type ActionCode, type ActionItemV2 } from "../actions/types";
import { type GoalRow } from "../report/mapGoals";
import { type CalcEvidence } from "../../calc";
import { buildEvidence, type EvidenceItem } from "./evidence";
import { resolveInterpretationActionHref } from "./actionLinks";
import {
  DEFAULT_PLANNING_POLICY,
  formatKrwUnit,
  formatMonthsUnit,
  formatPercentUnit,
  renderCopyTemplate,
  resolveActionCatalog,
  resolveActionCatalogById,
  resolveWarningCatalog,
  type PlanningInterpretationPolicy,
} from "../../catalog";

export type InterpretationVerdict = "GOOD" | "CAUTION" | "RISK" | "UNKNOWN";

export type InterpretationInput = {
  summary: {
    monthlySurplusKrw?: number;
    emergencyFundMonths?: number;
    endNetWorthKrw?: number;
    worstCashKrw?: number;
    worstCashMonthIndex?: number;
    dsrPct?: number;
    goalsAchievedText?: string;
  };
  aggregatedWarnings: Array<{
    code: string;
    severity: "info" | "warn" | "critical";
    count: number;
    firstMonth?: number;
    lastMonth?: number;
    sampleMessage?: string;
    suggestedActionId?: string;
    subjectLabel?: string;
  }>;
  goals: GoalRow[];
  outcomes?: {
    actionsTop?: ActionItemV2[];
    snapshotMeta?: {
      missing?: boolean;
      staleDays?: number;
    };
    monteCarlo?: {
      retirementDepletionBeforeEnd?: number;
    };
    runId?: string;
  };
  summaryEvidence?: {
    monthlySurplusKrw?: CalcEvidence;
    dsrPct?: CalcEvidence;
    emergencyFundMonths?: CalcEvidence;
  };
};

export type InterpretationVM = {
  verdict: {
    code: InterpretationVerdict;
    label: string;
    headline: string;
  };
  diagnostics: Array<{
    id: string;
    severity: "risk" | "caution" | "info";
    title: string;
    evidence: string;
    description: string;
    evidenceDetail?: CalcEvidence;
    evidenceItem?: EvidenceItem;
  }>;
  warnings: Array<{
    code: string;
    severity: "info" | "warn" | "critical";
    title: string;
    plainDescription: string;
    count: number;
    period: string;
    suggestedActionId?: string;
    subjectLabel?: string;
  }>;
  nextActions: Array<{
    id: string;
    title: string;
    description: string;
    steps: string[];
    href?: string;
  }>;
};

type DiagnosticCandidate = InterpretationVM["diagnostics"][number] & {
  rank: number;
};

const DIAGNOSTIC_PRIORITY: Record<string, number> = {
  "monthly-surplus": 0,
  dsr: 1,
  "emergency-fund": 2,
  snapshot: 3,
  goals: 4,
};

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPct(value: unknown): number | undefined {
  const raw = asFiniteNumber(value);
  if (typeof raw !== "number") return undefined;
  if (Math.abs(raw) <= 1) return raw * 100;
  return raw;
}

function parseGoalsAchievedText(text: string | undefined): { achieved: number; total: number } | null {
  if (typeof text !== "string") return null;
  const [achievedRaw, totalRaw] = text.trim().split("/");
  const achieved = Number(achievedRaw);
  const total = Number(totalRaw);
  if (!Number.isFinite(achieved) || !Number.isFinite(total) || total < 0) return null;
  return {
    achieved: Math.max(0, Math.trunc(achieved)),
    total: Math.max(0, Math.trunc(total)),
  };
}

function formatPeriod(firstMonth?: number, lastMonth?: number): string {
  if (typeof firstMonth !== "number" && typeof lastMonth !== "number") return "-";
  if (typeof firstMonth === "number" && typeof lastMonth === "number") {
    return firstMonth === lastMonth ? `M${firstMonth + 1}` : `M${firstMonth + 1}~M${lastMonth + 1}`;
  }
  if (typeof firstMonth === "number") return `M${firstMonth + 1}`;
  return `M${(lastMonth ?? 0) + 1}`;
}

function diagRank(severity: DiagnosticCandidate["severity"]): number {
  if (severity === "risk") return 3;
  if (severity === "caution") return 2;
  return 1;
}

function verdictLabel(code: InterpretationVerdict): string {
  if (code === "RISK") return renderCopyTemplate("verdict.RISK.label");
  if (code === "CAUTION") return renderCopyTemplate("verdict.CAUTION.label");
  if (code === "GOOD") return renderCopyTemplate("verdict.GOOD.label");
  return renderCopyTemplate("verdict.UNKNOWN.label");
}

function verdictHeadline(code: InterpretationVerdict): string {
  if (code === "RISK") return renderCopyTemplate("verdict.RISK.headline");
  if (code === "CAUTION") return renderCopyTemplate("verdict.CAUTION.headline");
  if (code === "GOOD") return renderCopyTemplate("verdict.GOOD.headline");
  return renderCopyTemplate("verdict.UNKNOWN.headline");
}

function sanitizeActionsTop(actionsTop: ActionItemV2[] | undefined): Array<{ id: ActionCode; title: string; summary: string; steps: string[] }> {
  if (!Array.isArray(actionsTop)) return [];
  return actionsTop.slice(0, 3).map((action) => {
    const title = typeof action.title === "string" && action.title.trim().length > 0
      ? action.title.trim()
      : resolveActionCatalog(action.code).title;
    const summary = typeof action.summary === "string" && action.summary.trim().length > 0
      ? action.summary.trim()
      : resolveActionCatalog(action.code).description;
    const steps = Array.isArray(action.steps)
      ? action.steps.map((step) => String(step).trim()).filter((step) => step.length > 0).slice(0, 3)
      : [];
    return {
      id: action.code,
      title,
      summary,
      steps,
    };
  });
}

export function buildInterpretationVM(
  input: InterpretationInput,
  policy: PlanningInterpretationPolicy = DEFAULT_PLANNING_POLICY,
): InterpretationVM {
  const evidenceByDiagId = (() => {
    const items = buildEvidence(
      {
        summaryCards: {
          ...(typeof input.summary.monthlySurplusKrw === "number" ? { monthlySurplusKrw: input.summary.monthlySurplusKrw } : {}),
          ...(typeof input.summary.dsrPct === "number" ? { dsrPct: input.summary.dsrPct } : {}),
          ...(typeof input.summary.emergencyFundMonths === "number" ? { emergencyFundMonths: input.summary.emergencyFundMonths } : {}),
        },
        evidence: {
          summary: input.summaryEvidence,
        },
      },
      policy,
      input.summaryEvidence,
    );
    const byMetric = new Map(items.map((item) => [item.id, item]));
    const toDiagEvidence = (item: EvidenceItem | undefined): EvidenceItem | undefined => {
      if (!item) return undefined;
      return {
        ...item,
        id: `${item.id}-diag`,
      };
    };
    return new Map<string, EvidenceItem>([
      ["monthly-surplus", toDiagEvidence(byMetric.get("monthlySurplus"))],
      ["dsr", toDiagEvidence(byMetric.get("dsrPct"))],
      ["emergency-fund", toDiagEvidence(byMetric.get("emergency"))],
    ].filter((entry): entry is [string, EvidenceItem] => Boolean(entry[1])));
  })();

  const monthlySurplusKrw = asFiniteNumber(input.summary.monthlySurplusKrw);
  const emergencyFundMonths = asFiniteNumber(input.summary.emergencyFundMonths);
  const worstCashKrw = asFiniteNumber(input.summary.worstCashKrw);
  const dsrPct = toPct(input.summary.dsrPct);
  const staleDays = asFiniteNumber(input.outcomes?.snapshotMeta?.staleDays);
  const snapshotMissing = input.outcomes?.snapshotMeta?.missing === true;
  const depletionPct = toPct(input.outcomes?.monteCarlo?.retirementDepletionBeforeEnd);
  const runId = asString(input.outcomes?.runId);

  const goalsAchieved = parseGoalsAchievedText(input.summary.goalsAchievedText);
  const goalsMissed = input.goals.length > 0
    ? input.goals.some((goal) => !goal.achieved || goal.shortfall > 0)
    : Boolean(goalsAchieved && goalsAchieved.total > goalsAchieved.achieved);

  const warningsSorted = [...input.aggregatedWarnings].sort((a, b) => {
    const severityRankA = a.severity === "critical" ? 0 : a.severity === "warn" ? 1 : 2;
    const severityRankB = b.severity === "critical" ? 0 : b.severity === "warn" ? 1 : 2;
    if (severityRankA !== severityRankB) return severityRankA - severityRankB;
    if (b.count !== a.count) return b.count - a.count;
    return a.code.localeCompare(b.code);
  });

  const warningCount = warningsSorted.reduce((sum, warning) => sum + Math.max(1, warning.count), 0);
  const criticalWarningCount = warningsSorted
    .filter((warning) => warning.severity === "critical")
    .reduce((sum, warning) => sum + Math.max(1, warning.count), 0);

  const diagnostics: DiagnosticCandidate[] = [];

  if (typeof monthlySurplusKrw === "number") {
    const severity: DiagnosticCandidate["severity"] = monthlySurplusKrw < policy.monthlySurplusKrw.riskMax
      ? "risk"
      : monthlySurplusKrw <= policy.monthlySurplusKrw.cautionMax
        ? "caution"
        : "info";
    diagnostics.push({
      id: "monthly-surplus",
      severity,
      rank: diagRank(severity),
      title: "월 잉여 현금",
      evidence: formatKrwUnit(monthlySurplusKrw),
      description: severity === "risk"
        ? "월 단위 적자가 발생해 현금 고갈 위험이 큽니다."
        : severity === "caution"
          ? "월 잉여가 0원 수준으로 작은 변동에도 취약합니다."
          : "월 단위 흑자 구조를 유지하고 있습니다.",
      ...(input.summaryEvidence?.monthlySurplusKrw ? { evidenceDetail: input.summaryEvidence.monthlySurplusKrw } : {}),
      ...(evidenceByDiagId.get("monthly-surplus") ? { evidenceItem: evidenceByDiagId.get("monthly-surplus") } : {}),
    });
  }

  if (typeof dsrPct === "number") {
    const severity: DiagnosticCandidate["severity"] = dsrPct >= policy.dsr.riskPct
      ? "risk"
      : dsrPct >= policy.dsr.cautionPct
        ? "caution"
        : "info";
    diagnostics.push({
      id: "dsr",
      severity,
      rank: diagRank(severity),
      title: "부채부담률(DSR)",
      evidence: formatPercentUnit(dsrPct, 1),
      description: severity === "risk"
        ? `DSR이 ${policy.dsr.riskPct}% 이상이라 상환 부담이 큽니다.`
        : severity === "caution"
          ? `DSR이 ${policy.dsr.cautionPct}% 이상이라 지출 변동에 민감합니다.`
          : "DSR이 안정 구간에 있습니다.",
      ...(input.summaryEvidence?.dsrPct ? { evidenceDetail: input.summaryEvidence.dsrPct } : {}),
      ...(evidenceByDiagId.get("dsr") ? { evidenceItem: evidenceByDiagId.get("dsr") } : {}),
    });
  }

  if (typeof emergencyFundMonths === "number") {
    const severity: DiagnosticCandidate["severity"] = emergencyFundMonths < policy.emergencyFundMonths.risk
      ? "risk"
      : emergencyFundMonths < policy.emergencyFundMonths.caution
        ? "caution"
        : "info";
    diagnostics.push({
      id: "emergency-fund",
      severity,
      rank: diagRank(severity),
      title: "비상금 커버",
      evidence: formatMonthsUnit(emergencyFundMonths, 1),
      description: severity === "risk"
        ? `비상금이 ${policy.emergencyFundMonths.risk}개월 미만입니다.`
        : severity === "caution"
          ? `비상금이 권장 ${policy.emergencyFundMonths.caution}개월 미만입니다.`
          : "비상금 커버가 권장 구간에 있습니다.",
      ...(input.summaryEvidence?.emergencyFundMonths ? { evidenceDetail: input.summaryEvidence.emergencyFundMonths } : {}),
      ...(evidenceByDiagId.get("emergency-fund") ? { evidenceItem: evidenceByDiagId.get("emergency-fund") } : {}),
    });
  }

  if (typeof worstCashKrw === "number") {
    const severity: DiagnosticCandidate["severity"] = worstCashKrw <= 0 ? "risk" : "info";
    diagnostics.push({
      id: "worst-cash",
      severity,
      rank: diagRank(severity),
      title: "최저 현금",
      evidence: formatKrwUnit(worstCashKrw),
      description: severity === "risk"
        ? "시뮬레이션 기간 중 현금이 0 이하로 내려갑니다."
        : "현금이 0 이하로 내려가지 않습니다.",
    });
  }

  if (warningCount > 0) {
    const severity: DiagnosticCandidate["severity"] = criticalWarningCount > 0
      ? "risk"
      : warningCount >= policy.warnings.cautionCount
        ? "caution"
        : "info";
    diagnostics.push({
      id: "warnings",
      severity,
      rank: diagRank(severity),
      title: "집계 경고",
      evidence: `${warningCount}건 (치명 ${criticalWarningCount}건)`,
      description: severity === "risk"
        ? "치명 경고가 포함되어 즉시 조치가 필요합니다."
        : severity === "caution"
          ? "경고가 누적되어 계획 안정성이 낮아질 수 있습니다."
          : "경고 수가 제한적입니다.",
    });
  }

  if (goalsMissed) {
    const total = input.goals.length || goalsAchieved?.total || 0;
    const achieved = input.goals.length
      ? input.goals.filter((goal) => goal.achieved && goal.shortfall <= 0).length
      : goalsAchieved?.achieved || 0;
    diagnostics.push({
      id: "goals",
      severity: "caution",
      rank: diagRank("caution"),
      title: "목표 달성",
      evidence: `${achieved}/${total}`,
      description: "일부 목표가 미달 상태입니다. 목표월/적립액 조정이 필요합니다.",
    });
  }

  if (typeof depletionPct === "number") {
    const severity: DiagnosticCandidate["severity"] = depletionPct >= policy.monteCarlo.riskDepletionPct
      ? "risk"
      : depletionPct >= policy.monteCarlo.cautionDepletionPct
        ? "caution"
        : "info";
    diagnostics.push({
      id: "monte-carlo",
      severity,
      rank: diagRank(severity),
      title: "은퇴 자산 고갈 확률",
      evidence: formatPercentUnit(depletionPct, 1),
      description: severity === "risk"
        ? "고갈 확률이 높아 보수적 조정이 필요합니다."
        : severity === "caution"
          ? "고갈 확률이 있어 대안 시나리오 비교가 필요합니다."
          : "고갈 확률은 낮은 편이지만 보장은 아닙니다.",
    });
  }

  if (snapshotMissing || typeof staleDays === "number") {
    const severity: DiagnosticCandidate["severity"] = snapshotMissing || (typeof staleDays === "number" && staleDays > policy.snapshot.staleRiskDays)
      ? "risk"
      : (typeof staleDays === "number" && staleDays > policy.snapshot.staleCautionDays)
        ? "caution"
        : "info";
    diagnostics.push({
      id: "snapshot",
      severity,
      rank: diagRank(severity),
      title: "가정 스냅샷 최신성",
      evidence: snapshotMissing ? "missing" : `${Math.max(0, Math.trunc(staleDays ?? 0))}일`,
      description: snapshotMissing
        ? "스냅샷이 없어 기본 가정으로 계산되었습니다."
        : severity === "risk"
          ? `스냅샷 staleDays가 ${policy.snapshot.staleRiskDays}일을 초과했습니다.`
          : severity === "caution"
            ? `스냅샷 staleDays가 ${policy.snapshot.staleCautionDays}일을 초과했습니다.`
            : "스냅샷 최신성은 양호합니다.",
    });
  }

  diagnostics.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const priorityA = DIAGNOSTIC_PRIORITY[a.id] ?? 99;
    const priorityB = DIAGNOSTIC_PRIORITY[b.id] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.id.localeCompare(b.id);
  });

  const hasKeyMetrics = typeof monthlySurplusKrw === "number"
    && typeof emergencyFundMonths === "number"
    && typeof dsrPct === "number";

  const verdict: InterpretationVerdict = !hasKeyMetrics
    ? "UNKNOWN"
    : ((monthlySurplusKrw < policy.monthlySurplusKrw.riskMax && emergencyFundMonths < policy.emergencyFundMonths.risk)
      || dsrPct >= policy.dsr.riskPct)
      ? "RISK"
      : (emergencyFundMonths < policy.emergencyFundMonths.caution
        || (dsrPct >= policy.dsr.cautionPct && dsrPct < policy.dsr.riskPct)
        || monthlySurplusKrw < policy.monthlySurplusKrw.riskMax)
        ? "CAUTION"
        : (monthlySurplusKrw >= policy.monthlySurplusKrw.riskMax
          && emergencyFundMonths >= policy.emergencyFundMonths.caution
          && dsrPct < policy.dsr.cautionPct)
          ? "GOOD"
          : "UNKNOWN";

  const warnings = warningsSorted.slice(0, 10).map((warning) => {
    const catalog = resolveWarningCatalog(warning.code);
    return {
      code: warning.code,
      severity: warning.severity,
      title: catalog.title,
      plainDescription: catalog.plainDescription,
      count: Math.max(1, warning.count),
      period: formatPeriod(warning.firstMonth, warning.lastMonth),
      ...(warning.suggestedActionId || catalog.suggestedActionId
        ? { suggestedActionId: warning.suggestedActionId ?? catalog.suggestedActionId }
        : {}),
      ...(typeof warning.subjectLabel === "string" && warning.subjectLabel.trim().length > 0
        ? { subjectLabel: warning.subjectLabel.trim() }
        : {}),
    };
  });

  const nextActionMap = new Map<string, InterpretationVM["nextActions"][number]>();
  const resolveHref = (actionId: string, fallbackHref?: string): string | undefined => {
    const resolved = resolveInterpretationActionHref(actionId, { ...(runId ? { runId } : {}) });
    if (resolved) return resolved;
    return fallbackHref;
  };

  for (const action of sanitizeActionsTop(input.outcomes?.actionsTop)) {
    const catalog = resolveActionCatalog(action.id);
    nextActionMap.set(action.id, {
      id: action.id,
      title: action.title,
      description: action.summary,
      steps: action.steps.length > 0 ? action.steps : catalog.steps,
      ...(resolveHref(action.id, catalog.href) ? { href: resolveHref(action.id, catalog.href) } : {}),
    });
  }

  for (const warning of warnings) {
    const actionId = warning.suggestedActionId;
    if (!actionId) continue;
    if (nextActionMap.has(actionId)) continue;
    const catalog = resolveActionCatalogById(actionId);
    if (!catalog) continue;
    nextActionMap.set(actionId, {
      id: catalog.code,
      title: catalog.title,
      description: catalog.description,
      steps: catalog.steps,
      ...(resolveHref(catalog.code, catalog.href) ? { href: resolveHref(catalog.code, catalog.href) } : {}),
    });
  }

  if ((snapshotMissing || (typeof staleDays === "number" && staleDays > policy.snapshot.staleCautionDays)) && !nextActionMap.has("SET_ASSUMPTIONS_REVIEW")) {
    const catalog = resolveActionCatalogById("SET_ASSUMPTIONS_REVIEW");
    if (catalog) {
      nextActionMap.set("SET_ASSUMPTIONS_REVIEW", {
        id: catalog.code,
        title: catalog.title,
        description: catalog.description,
        steps: catalog.steps,
        ...(resolveHref(catalog.code, catalog.href) ? { href: resolveHref(catalog.code, catalog.href) } : {}),
      });
    }
  }

  const candidateComparisonNeeded = (typeof dsrPct === "number" && dsrPct >= policy.dsr.cautionPct)
    || (
      typeof monthlySurplusKrw === "number"
      && monthlySurplusKrw > 0
      && typeof emergencyFundMonths === "number"
      && emergencyFundMonths < policy.emergencyFundMonths.caution
    );
  if (candidateComparisonNeeded && !nextActionMap.has("OPEN_CANDIDATE_COMPARISON")) {
    const catalog = resolveActionCatalogById("OPEN_CANDIDATE_COMPARISON");
    if (catalog) {
      nextActionMap.set("OPEN_CANDIDATE_COMPARISON", {
        id: catalog.code,
        title: catalog.title,
        description: catalog.description,
        steps: catalog.steps,
        ...(resolveHref(catalog.code, catalog.href) ? { href: resolveHref(catalog.code, catalog.href) } : {}),
      });
    }
  }

  if (runId && !nextActionMap.has("MANAGE_ACTION_CENTER")) {
    const catalog = resolveActionCatalogById("MANAGE_ACTION_CENTER");
    if (catalog) {
      nextActionMap.set("MANAGE_ACTION_CENTER", {
        id: catalog.code,
        title: catalog.title,
        description: catalog.description,
        steps: catalog.steps,
        ...(resolveHref(catalog.code, catalog.href) ? { href: resolveHref(catalog.code, catalog.href) } : {}),
      });
    }
  }

  if (nextActionMap.size === 0) {
    const fallback = resolveActionCatalogById("INPUT_REVIEW");
    if (fallback) {
      nextActionMap.set("INPUT_REVIEW", {
        id: fallback.code,
        title: fallback.title,
        description: fallback.description,
        steps: fallback.steps,
        ...(resolveHref(fallback.code, fallback.href) ? { href: resolveHref(fallback.code, fallback.href) } : {}),
      });
    }
  }

  if (nextActionMap.size === 0) {
    const fallback = resolveActionCatalog("SET_ASSUMPTIONS_REVIEW");
    nextActionMap.set("SET_ASSUMPTIONS_REVIEW", {
      id: fallback.code,
      title: fallback.title,
      description: fallback.description,
      steps: fallback.steps,
      ...(resolveHref(fallback.code, fallback.href) ? { href: resolveHref(fallback.code, fallback.href) } : {}),
    });
  }

  const nextActions = Array.from(nextActionMap.values()).slice(0, 3);

  return {
    verdict: {
      code: verdict,
      label: verdictLabel(verdict),
      headline: verdictHeadline(verdict),
    },
    diagnostics: diagnostics.slice(0, 3).map(({ rank: _rank, ...diag }) => diag),
    warnings,
    nextActions,
  };
}
