import { answerQuestion, type PlanningQuestion } from "./qa";
import { type PlanResultV2 } from "./types";
import { LIMITS } from "../../v2/limits";
import { aggregateWarnings, type AggregatedWarning } from "./report/warningsAggregate";

type ReportSnapshotMeta = {
  id?: string;
  asOf?: string;
  fetchedAt?: string;
  missing?: boolean;
};

type ReportInput = {
  title?: string;
  generatedAt?: string;
  snapshot?: ReportSnapshotMeta;
  assumptionsLabel?: string;
  plan: PlanResultV2;
  scenarios?: unknown;
  monteCarlo?: unknown;
  actions?: unknown;
  questions?: PlanningQuestion[];
};

type ReportAction = {
  code: string;
  title: string;
  summary: string;
  severity: "info" | "warn" | "critical";
  whyCodes: string[];
};

type ScenarioRow = {
  id: string;
  title: string;
  endNetWorthDeltaKrw?: number;
  goalsAchievedDelta?: number;
};

type SummaryMetric = {
  label: string;
  value: string;
};

const ACTION_SEVERITY_ORDER: Record<ReportAction["severity"], number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

const SEVERITY_LABEL: Record<AggregatedWarning["severity"], string> = {
  critical: "critical",
  warn: "warn",
  info: "info",
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function toPercent1(value: number): string {
  return `${(Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1)}%`;
}

function sanitizeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function monthRangeLabel(summary: AggregatedWarning): string {
  const first = summary.months?.first;
  const last = summary.months?.last;
  if (typeof first !== "number" && typeof last !== "number") return "-";
  if (typeof first === "number" && typeof last === "number") {
    if (first === last) return `M${first + 1}`;
    return `M${first + 1}~M${last + 1}`;
  }
  if (typeof first === "number") return `M${first + 1}`;
  return `M${(last ?? 0) + 1}`;
}

function parseActions(actions: unknown): ReportAction[] {
  const rows = asArray(asRecord(actions).actions);
  return rows.map((row) => {
    const item = asRecord(row);
    const whyCodes = asArray(item.why)
      .map((why) => asString(asRecord(why).code).trim())
      .filter((code) => code.length > 0);
    const severityRaw = asString(item.severity).trim();
    return {
      code: asString(item.code).trim() || "UNKNOWN",
      title: asString(item.title).trim() || "Untitled action",
      summary: asString(item.summary).trim(),
      severity: severityRaw === "critical" || severityRaw === "warn" ? severityRaw : "info",
      whyCodes,
    };
  });
}

function topActions(actions: unknown): ReportAction[] {
  return parseActions(actions)
    .sort((a, b) => {
      const bySeverity = ACTION_SEVERITY_ORDER[a.severity] - ACTION_SEVERITY_ORDER[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return a.code.localeCompare(b.code);
    })
    .slice(0, 3);
}

function actionHintForWarning(code: string, actions: ReportAction[]): string {
  const matched = actions.find((action) => action.whyCodes.includes(code));
  if (!matched) return "-";
  return `${matched.code}: ${matched.title}`;
}

function warningInterpretation(summary: AggregatedWarning): string {
  return summary.sampleMessage || `${summary.code} 경고가 감지되었습니다.`;
}

function warningTableRows(warnings: AggregatedWarning[], actions: ReportAction[]): string[] {
  const rows = [
    "| code | severity | count | first~last | 해석 | 연결 조치 |",
    "| --- | --- | ---: | --- | --- | --- |",
  ];
  for (const warning of warnings.slice(0, LIMITS.reportWarningsTop)) {
    rows.push(
      `| ${warning.code} | ${SEVERITY_LABEL[warning.severity]} | ${warning.count} | ${monthRangeLabel(warning)} | ${sanitizeCell(warningInterpretation(warning))} | ${sanitizeCell(actionHintForWarning(warning.code, actions))} |`,
    );
  }
  return rows;
}

function summaryMetrics(plan: PlanResultV2, groupedWarnings: AggregatedWarning[]): SummaryMetric[] {
  const last = plan.timeline[plan.timeline.length - 1];
  const worst = plan.timeline.reduce(
    (best, row, index) => (row.liquidAssets < best.value ? { value: row.liquidAssets, month: index } : best),
    { value: Number.POSITIVE_INFINITY, month: 0 },
  );
  const achievedGoals = plan.goalStatus.filter((goal) => goal.achieved).length;
  const maxDsr = plan.timeline.reduce((max, row) => Math.max(max, row.debtServiceRatio), 0);
  return [
    { label: "말기 순자산", value: toMoney(last?.netWorth ?? 0) },
    { label: "최저 현금", value: `${toMoney(Number.isFinite(worst.value) ? worst.value : 0)} (${worst.month + 1}개월차)` },
    { label: "마지막 월 총부채", value: toMoney(last?.totalDebt ?? 0) },
    { label: "목표 달성", value: `${achievedGoals}/${plan.goalStatus.length}` },
    { label: "경고(코드 그룹)", value: `${groupedWarnings.length}개` },
    { label: "최대 DSR", value: toPercent1(maxDsr * 100) },
    { label: "타임라인", value: `${plan.timeline.length}개월` },
  ];
}

function summaryMetricTableRows(rows: SummaryMetric[]): string[] {
  if (rows.length === 0) return ["- 요약 지표 없음"];
  const table = [
    "| 지표 | 값 |",
    "| --- | --- |",
  ];
  for (const row of rows.slice(0, 7)) {
    table.push(`| ${sanitizeCell(row.label)} | ${sanitizeCell(row.value)} |`);
  }
  return table;
}

function keyFindings(plan: PlanResultV2, groupedWarnings: AggregatedWarning[]): string[] {
  const findings: string[] = [];
  const criticalWarnings = groupedWarnings.filter((warning) => warning.severity === "critical");
  if (criticalWarnings.length > 0) {
    findings.push(`치명 경고 ${criticalWarnings.length}건: ${criticalWarnings.map((item) => item.code).join(", ")}`);
  }

  const goalMissed = plan.goalStatus.filter((goal) => !goal.achieved && goal.targetMonth <= plan.timeline.length);
  if (goalMissed.length > 0) {
    findings.push(`목표 미달 ${goalMissed.length}건: ${goalMissed.map((goal) => goal.name).slice(0, 3).join(", ")}`);
  }

  const worst = plan.timeline.reduce(
    (best, row, index) => (row.liquidAssets < best.value ? { value: row.liquidAssets, month: index } : best),
    { value: Number.POSITIVE_INFINITY, month: 0 },
  );
  if (Number.isFinite(worst.value) && worst.value < 0) {
    findings.push(`현금 부족 발생: ${worst.month + 1}개월차 최저 ${toMoney(worst.value)}`);
  }

  if (findings.length < 3) {
    const last = plan.timeline[plan.timeline.length - 1];
    findings.push(`말기 순자산은 ${toMoney(last?.netWorth ?? 0)}입니다.`);
  }
  if (findings.length < 3) {
    findings.push(`경고 요약과 액션 상위 3개를 우선 점검하세요.`);
  }
  return findings.slice(0, 3).map((item) => `- ${item}`);
}

function goalStatusTableRows(plan: PlanResultV2): string[] {
  if (plan.goalStatus.length === 0) return ["- 없음"];
  const rows = [
    "| 목표 | 달성 | 진행률 | 부족액 | 목표월 |",
    "| --- | --- | ---: | ---: | ---: |",
  ];
  for (const goal of plan.goalStatus.slice(0, LIMITS.goalsTop)) {
    rows.push(
      `| ${sanitizeCell(goal.name)} | ${goal.achieved ? "Y" : "N"} | ${goal.progressPct.toFixed(1)}% | ${Math.round(goal.shortfall).toLocaleString("ko-KR")} | ${goal.targetMonth} |`,
    );
  }
  return rows;
}

function actionTableRows(actions: ReportAction[]): string[] {
  if (actions.length === 0) return ["- 없음"];
  const rows = [
    "| severity | code | title | summary |",
    "| --- | --- | --- | --- |",
  ];
  for (const action of actions.slice(0, LIMITS.actionsTop)) {
    rows.push(
      `| ${action.severity} | ${action.code} | ${sanitizeCell(action.title)} | ${sanitizeCell(action.summary || "-")} |`,
    );
  }
  return rows;
}

function debtAnalysisRows(plan: PlanResultV2): string[] | null {
  if (plan.timeline.length === 0) return null;
  const hasDebt = plan.timeline.some((row) => row.totalDebt > 0);
  if (!hasDebt) return null;

  const last = plan.timeline[plan.timeline.length - 1];
  const peakDebt = plan.timeline.reduce(
    (best, row, index) => (row.totalDebt > best.value ? { value: row.totalDebt, month: index } : best),
    { value: 0, month: 0 },
  );
  const peakDsr = plan.timeline.reduce(
    (best, row, index) => (row.debtServiceRatio > best.value ? { value: row.debtServiceRatio, month: index } : best),
    { value: 0, month: 0 },
  );
  return [
    `- 마지막 월 총부채: ${toMoney(last?.totalDebt ?? 0)}`,
    `- 최대 총부채: ${toMoney(peakDebt.value)} (${peakDebt.month + 1}개월차)`,
    `- 최대 DSR: ${toPercent1(peakDsr.value * 100)} (${peakDsr.month + 1}개월차)`,
  ];
}

function scenarioRows(scenarios: unknown): ScenarioRow[] {
  const rows = asArray(asRecord(scenarios).scenarios);
  return rows.map((row) => {
    const item = asRecord(row);
    const diff = asRecord(item.diffVsBase);
    const metrics = asRecord(diff.keyMetrics);
    return {
      id: asString(item.id) || "unknown",
      title: asString(item.title) || asString(item.id) || "unknown",
      endNetWorthDeltaKrw: asNumber(metrics.endNetWorthDeltaKrw),
      goalsAchievedDelta: asNumber(metrics.goalsAchievedDelta),
    };
  });
}

function scenariosSummaryLines(scenarios: unknown): string[] {
  const rows = scenarioRows(scenarios);
  if (rows.length === 0) return ["- 시나리오 요약 데이터가 없습니다."];
  const lines = [
    "| 시나리오 | 말기 순자산 변화 | 목표 달성 변화 |",
    "| --- | ---: | ---: |",
  ];
  for (const row of rows.slice(0, 5)) {
    lines.push(`| ${sanitizeCell(row.title)} | ${Math.round(row.endNetWorthDeltaKrw ?? 0).toLocaleString("ko-KR")} | ${Math.round(row.goalsAchievedDelta ?? 0)} |`);
  }
  return lines;
}

function monteCarloSummaryLines(monteCarlo: unknown): string[] {
  const model = asRecord(monteCarlo);
  const probabilities = asRecord(model.probabilities);
  const percentiles = asRecord(model.percentiles);
  if (Object.keys(probabilities).length === 0 && Object.keys(percentiles).length === 0) {
    return ["- Monte Carlo 요약 데이터가 없습니다."];
  }
  const lines: string[] = [];
  const depletion = asNumber(probabilities.retirementDepletionBeforeEnd);
  if (typeof depletion === "number") {
    lines.push(`- 은퇴 전 자산 고갈 확률: ${(depletion * 100).toFixed(1)}%`);
  }
  const endNetWorth = asRecord(percentiles.endNetWorthKrw);
  if (typeof endNetWorth.p10 === "number" || typeof endNetWorth.p50 === "number" || typeof endNetWorth.p90 === "number") {
    lines.push(`- 말기 순자산 P10/P50/P90: ${Math.round(Number(endNetWorth.p10 ?? 0)).toLocaleString("ko-KR")} / ${Math.round(Number(endNetWorth.p50 ?? 0)).toLocaleString("ko-KR")} / ${Math.round(Number(endNetWorth.p90 ?? 0)).toLocaleString("ko-KR")}`);
  }
  return lines.length > 0 ? lines : ["- Monte Carlo 요약 데이터가 없습니다."];
}

function stringifyJson(value: unknown): string {
  return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

export function toMarkdownReport(input: ReportInput): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const title = input.title?.trim() || "Planning v2 Report";
  const groupedWarnings = aggregateWarnings(input.plan.warnings);
  const actionRows = parseActions(input.actions);
  const topActionRows = topActions(input.actions);
  const debtRows = debtAnalysisRows(input.plan);
  const questions: PlanningQuestion[] = input.questions ?? [
    "WHY_GOAL_MISSED",
    "WHY_CASH_LOW",
    "WHY_DEBT_RISKY",
    "WHAT_ASSUMPTIONS_MATTER",
  ];

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  lines.push("## 기준정보");
  lines.push(`- 생성시각: ${generatedAt}`);
  lines.push(`- 스냅샷 ID: ${input.snapshot?.id ?? "latest"}`);
  lines.push(`- 스냅샷 asOf: ${input.snapshot?.asOf ?? "-"}`);
  lines.push(`- 스냅샷 fetchedAt: ${input.snapshot?.fetchedAt ?? "-"}`);
  lines.push(`- 스냅샷 누락: ${input.snapshot?.missing === true ? "Y" : "N"}`);
  if (input.assumptionsLabel) {
    lines.push(`- 가정: ${input.assumptionsLabel}`);
  }
  lines.push("");

  lines.push("## Executive Summary");
  lines.push(...summaryMetricTableRows(summaryMetrics(input.plan, groupedWarnings)));
  lines.push("");

  lines.push("## Key Findings (Top 3)");
  lines.push(...keyFindings(input.plan, groupedWarnings));
  lines.push("");

  lines.push("## Warnings Summary");
  if (groupedWarnings.length === 0) {
    lines.push("- 없음");
  } else {
    lines.push(...warningTableRows(groupedWarnings, actionRows));
  }
  lines.push("");

  lines.push("## Goal Status");
  lines.push(...goalStatusTableRows(input.plan));
  lines.push("");

  lines.push("## Action Plan (Top 3)");
  lines.push(...actionTableRows(topActionRows));
  lines.push("");

  if (debtRows) {
    lines.push("## Debt Analysis");
    lines.push(...debtRows);
    lines.push("");
  }

  if (input.scenarios || input.monteCarlo) {
    lines.push("## Scenarios / Monte Carlo");
    if (input.scenarios) {
      lines.push("### Scenarios");
      lines.push(...scenariosSummaryLines(input.scenarios));
      lines.push("");
    }
    if (input.monteCarlo) {
      lines.push("### Monte Carlo");
      lines.push(...monteCarloSummaryLines(input.monteCarlo));
      lines.push("");
    }
  }

  lines.push("## Appendix");
  lines.push(`### Decision Traces (Top ${LIMITS.tracesTop})`);
  const traces = input.plan.traces ?? [];
  if (traces.length === 0) {
    lines.push("- 없음");
  } else {
    for (const trace of traces.slice(0, LIMITS.tracesTop)) {
      lines.push(`- [${trace.code}] ${trace.message}${typeof trace.monthIndex === "number" ? ` (month ${trace.monthIndex + 1})` : ""}`);
    }
  }
  lines.push("");

  lines.push("### Q&A");
  for (const question of questions) {
    const answer = answerQuestion(question, input.plan);
    lines.push(`#### ${answer.title}`);
    for (const bullet of answer.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push(`- Evidence: ${answer.evidenceCodes.join(", ") || "N/A"}`);
    lines.push("");
  }

  if (input.scenarios) {
    lines.push("### Scenarios Raw (JSON)");
    lines.push(stringifyJson(input.scenarios));
    lines.push("");
  }

  if (input.monteCarlo) {
    lines.push("### Monte Carlo Raw (JSON)");
    lines.push(stringifyJson(input.monteCarlo));
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
