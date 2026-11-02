import { buildStandaloneReportArtifactsFromRun } from "../../reports/standaloneReportArtifacts";
import { roundKrw, roundToInteger } from "../../calc/roundingPolicy";
import { sanitizeRecordId } from "../../store/paths";
import { type PlanningRunRecord } from "../../store/types";
import { getCurrentUserRun } from "../runs/repository";

export type CurrentUserRunReportHtml = {
  html: string;
  htmlFilename: string;
  pdfFilename: string;
};

export type CurrentUserRunComparisonReportResult =
  | {
    ok: true;
    report: CurrentUserRunReportHtml;
  }
  | {
    ok: false;
    reason: "INVALID_COMPARE_RUN_ID" | "SELF_COMPARE" | "RUN_NOT_FOUND" | "COMPARE_RUN_NOT_FOUND";
  };

type ReportArtifacts = ReturnType<typeof buildStandaloneReportArtifactsFromRun>;

type MetricKind = "money" | "pct" | "months" | "count";

const COMPARISON_METRICS: Array<{
  key: keyof ReportArtifacts["vm"]["summaryCards"];
  label: string;
  kind: MetricKind;
}> = [
  { key: "monthlySurplusKrw", label: "매달 남는 돈", kind: "money" },
  { key: "dsrPct", label: "대출 상환 비중", kind: "pct" },
  { key: "emergencyFundMonths", label: "비상금 유지 기간", kind: "months" },
  { key: "debtTotalKrw", label: "총 대출 잔액", kind: "money" },
  { key: "endNetWorthKrw", label: "말기 순자산", kind: "money" },
  { key: "worstCashKrw", label: "최저 현금", kind: "money" },
];

function escapeHtml(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatMetric(value: unknown, kind: MetricKind): string {
  const number = asFiniteNumber(value);
  if (typeof number !== "number") return "-";
  if (kind === "money") return `${roundKrw(number).toLocaleString("ko-KR")}원`;
  if (kind === "pct") return `${number.toFixed(1)}%`;
  if (kind === "months") return `${number.toFixed(1)}개월`;
  return (roundToInteger(number) ?? 0).toLocaleString("ko-KR");
}

function formatMetricDelta(base: unknown, current: unknown, kind: MetricKind): string {
  const baseNumber = asFiniteNumber(base);
  const currentNumber = asFiniteNumber(current);
  if (typeof baseNumber !== "number" || typeof currentNumber !== "number") return "-";
  const delta = currentNumber - baseNumber;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${formatMetric(delta, kind)}`;
}

function formatRunLabel(run: PlanningRunRecord): string {
  const title = typeof run.title === "string" ? run.title.trim() : "";
  return title || run.id;
}

function formatHealthWarningCodes(run: PlanningRunRecord): string {
  const health = run.meta.health;
  if (!health) return "-";
  const codes = [...new Set([...(health?.warningsCodes ?? []), ...(health?.warningCodes ?? [])])];
  return codes.length > 0 ? codes.join(", ") : "없음";
}

function formatSnapshotMissing(artifacts: ReportArtifacts): string {
  if (artifacts.vm.snapshot.missing) return "예";
  if (artifacts.vm.snapshot.id || artifacts.vm.snapshot.asOf || artifacts.vm.snapshot.fetchedAt) return "아니요";
  return "-";
}

function buildMetricComparisonRows(base: ReportArtifacts, current: ReportArtifacts): string {
  return COMPARISON_METRICS.map((metric) => {
    const baseValue = base.vm.summaryCards[metric.key];
    const currentValue = current.vm.summaryCards[metric.key];
    return `
      <tr>
        <td>${escapeHtml(metric.label)}</td>
        <td class="right">${escapeHtml(formatMetric(baseValue, metric.kind))}</td>
        <td class="right">${escapeHtml(formatMetric(currentValue, metric.kind))}</td>
        <td class="right">${escapeHtml(formatMetricDelta(baseValue, currentValue, metric.kind))}</td>
      </tr>`;
  }).join("");
}

function buildSnapshotAndHealthRows(input: {
  baseRun: PlanningRunRecord;
  currentRun: PlanningRunRecord;
  base: ReportArtifacts;
  current: ReportArtifacts;
}): string {
  const rows = [
    ["스냅샷 ID", input.base.vm.snapshot.id ?? "-", input.current.vm.snapshot.id ?? "-"],
    ["기준일(asOf)", input.base.vm.snapshot.asOf ?? "-", input.current.vm.snapshot.asOf ?? "-"],
    ["수집 시각(fetchedAt)", input.base.vm.snapshot.fetchedAt ?? "-", input.current.vm.snapshot.fetchedAt ?? "-"],
    ["스냅샷 누락", formatSnapshotMissing(input.base), formatSnapshotMissing(input.current)],
    ["기준일 경과 일수", input.base.vm.snapshot.staleDays ?? "-", input.current.vm.snapshot.staleDays ?? "-"],
    ["스냅샷 경고 수", input.baseRun.meta.snapshot?.warningsCount ?? "-", input.currentRun.meta.snapshot?.warningsCount ?? "-"],
    ["실행 상태", input.baseRun.overallStatus ?? "-", input.currentRun.overallStatus ?? "-"],
    ["치명 상태 수", input.baseRun.meta.health?.criticalCount ?? "-", input.currentRun.meta.health?.criticalCount ?? "-"],
    ["상태 경고 코드", formatHealthWarningCodes(input.baseRun), formatHealthWarningCodes(input.currentRun)],
  ];

  return rows.map(([label, baseValue, currentValue]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(baseValue)}</td>
        <td>${escapeHtml(currentValue)}</td>
      </tr>`).join("");
}

function buildOverrideComparisonRows(base: ReportArtifacts, current: ReportArtifacts): string {
  const baseOverrides = new Map(
    (base.vm.reproducibility?.appliedOverrides ?? []).map((entry) => [entry.key, entry]),
  );
  const currentOverrides = new Map(
    (current.vm.reproducibility?.appliedOverrides ?? []).map((entry) => [entry.key, entry]),
  );
  const keys = [...new Set([...baseOverrides.keys(), ...currentOverrides.keys()])].sort();
  const changedKeys = keys.filter((key) => baseOverrides.get(key)?.value !== currentOverrides.get(key)?.value);

  if (changedKeys.length === 0) {
    return '<tr><td colspan="3">두 실행 사이에 적용값이 달라진 오버라이드가 없습니다.</td></tr>';
  }

  return changedKeys.map((key) => {
    const baseEntry = baseOverrides.get(key);
    const currentEntry = currentOverrides.get(key);
    const baseLabel = baseEntry ? `${baseEntry.value}%${baseEntry.reason ? ` · ${baseEntry.reason}` : ""}` : "미적용";
    const currentLabel = currentEntry ? `${currentEntry.value}%${currentEntry.reason ? ` · ${currentEntry.reason}` : ""}` : "미적용";
    return `
      <tr>
        <td>${escapeHtml(key)}</td>
        <td>${escapeHtml(baseLabel)}</td>
        <td>${escapeHtml(currentLabel)}</td>
      </tr>`;
  }).join("");
}

function buildComparisonSection(input: {
  baseRun: PlanningRunRecord;
  currentRun: PlanningRunRecord;
  base: ReportArtifacts;
  current: ReportArtifacts;
}): string {
  return `
  <section>
    <h2>실행 비교</h2>
    <p class="muted">기준 실행: ${escapeHtml(formatRunLabel(input.baseRun))} (${escapeHtml(input.baseRun.id)}) · 비교 실행: ${escapeHtml(formatRunLabel(input.currentRun))} (${escapeHtml(input.currentRun.id)})</p>
    <p>변화 값은 비교 실행에서 기준 실행을 뺀 값입니다. 값이 없으면 임의로 0으로 계산하지 않고 -로 표시합니다.</p>
    <h3 class="section-subhead">핵심 지표 차이</h3>
    <table>
      <thead><tr><th>지표</th><th>기준 실행</th><th>비교 실행</th><th>변화</th></tr></thead>
      <tbody>${buildMetricComparisonRows(input.base, input.current)}</tbody>
    </table>
    <h3 class="section-subhead">스냅샷 및 상태</h3>
    <table>
      <thead><tr><th>항목</th><th>기준 실행</th><th>비교 실행</th></tr></thead>
      <tbody>${buildSnapshotAndHealthRows(input)}</tbody>
    </table>
    <h3 class="section-subhead">오버라이드 차이</h3>
    <table>
      <thead><tr><th>항목</th><th>기준 실행</th><th>비교 실행</th></tr></thead>
      <tbody>${buildOverrideComparisonRows(input.base, input.current)}</tbody>
    </table>
  </section>`;
}

function insertComparisonSection(html: string, section: string): string {
  const firstSectionMarker = "\n\n  <section>";
  if (html.includes(firstSectionMarker)) {
    return html.replace(firstSectionMarker, `${section}${firstSectionMarker}`);
  }
  return html.replace("</body>", `${section}\n</body>`);
}

export async function getCurrentUserRunReportHtml(input: {
  runId: string;
  printView?: boolean;
}): Promise<CurrentUserRunReportHtml | null> {
  const run = await getCurrentUserRun(input.runId);
  if (!run) return null;

  const { html } = buildStandaloneReportArtifactsFromRun(run, {
    printView: input.printView ?? false,
  });

  return {
    html,
    htmlFilename: `planning-run-report-${run.id}.html`,
    pdfFilename: `planning-run-${run.id}.pdf`,
  };
}

export async function getCurrentUserRunComparisonReportHtml(input: {
  runId: string;
  compareToRunId: string;
  printView?: boolean;
}): Promise<CurrentUserRunComparisonReportResult> {
  let compareToRunId = "";
  try {
    compareToRunId = sanitizeRecordId(input.compareToRunId);
  } catch {
    return { ok: false, reason: "INVALID_COMPARE_RUN_ID" };
  }

  if (compareToRunId === input.runId.trim()) {
    return { ok: false, reason: "SELF_COMPARE" };
  }

  const currentRun = await getCurrentUserRun(input.runId);
  if (!currentRun) return { ok: false, reason: "RUN_NOT_FOUND" };

  const baseRun = await getCurrentUserRun(compareToRunId);
  if (!baseRun) return { ok: false, reason: "COMPARE_RUN_NOT_FOUND" };

  const currentArtifacts = buildStandaloneReportArtifactsFromRun(currentRun, {
    printView: input.printView ?? false,
  });
  const baseArtifacts = buildStandaloneReportArtifactsFromRun(baseRun, {
    printView: input.printView ?? false,
  });
  const comparisonSection = buildComparisonSection({
    baseRun,
    currentRun,
    base: baseArtifacts,
    current: currentArtifacts,
  });

  return {
    ok: true,
    report: {
      html: insertComparisonSection(currentArtifacts.html, comparisonSection),
      htmlFilename: `planning-run-comparison-${baseRun.id}-${currentRun.id}.html`,
      pdfFilename: `planning-run-comparison-${baseRun.id}-${currentRun.id}.pdf`,
    },
  };
}
