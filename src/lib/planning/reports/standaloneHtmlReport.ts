import { type AssumptionsOverrideEntry } from "../assumptions/overrides";
import { type CalcEvidence } from "../calc";

export type StandaloneReportRenderInput = {
  runId: string;
  reportId: string;
  createdAt: string;
  summaryCards: {
    monthlySurplusKrw?: number;
    dsrPct?: number;
    emergencyFundMonths?: number;
    debtTotalKrw?: number;
  };
  warnings: Array<{
    title: string;
    code: string;
    severityMax: string;
    count: number;
    periodMinMax: string;
    plainDescription: string;
  }>;
  goals: Array<{
    name: string;
    targetAmount: number;
    currentAmount: number;
    shortfall: number;
    achieved: boolean;
  }>;
  actions: Array<{
    title: string;
    summary: string;
    steps: string[];
  }>;
  verdict: {
    label: string;
    headline: string;
  };
  diagnostics: Array<{
    title: string;
    evidence: string;
    description: string;
    evidenceDetail?: CalcEvidence;
  }>;
  reproducibility?: {
    runId: string;
    createdAt: string;
    assumptionsSnapshotId?: string;
    staleDays?: number;
    appVersion: string;
    engineVersion: string;
    profileHash: string;
    assumptionsHash?: string;
    effectiveAssumptionsHash?: string;
    appliedOverrides: AssumptionsOverrideEntry[];
    policy: unknown;
  };
  printView?: boolean;
};

function escapeHtml(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatMoney(value: unknown): string {
  const n = asNumber(value);
  if (typeof n !== "number") return "-";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function formatPct(value: unknown): string {
  const n = asNumber(value);
  if (typeof n !== "number") return "-";
  return `${n.toFixed(1)}%`;
}

export function renderStandaloneHtml(input: StandaloneReportRenderInput): string {
  const warningRows = input.warnings.length > 0
    ? input.warnings
      .map((warning) => `
        <tr>
          <td>${escapeHtml(warning.title)}<div class="muted">${escapeHtml(warning.code)}</div></td>
          <td>${escapeHtml(warning.severityMax)}</td>
          <td>${warning.count}</td>
          <td>${escapeHtml(warning.periodMinMax)}</td>
          <td>${escapeHtml(warning.plainDescription)}</td>
        </tr>
      `)
      .join("")
    : "<tr><td colspan=\"5\">경고 없음</td></tr>";

  const goalRows = input.goals.length > 0
    ? input.goals
      .map((goal) => `
        <tr>
          <td>${escapeHtml(goal.name)}</td>
          <td class="right">${escapeHtml(formatMoney(goal.targetAmount))}</td>
          <td class="right">${escapeHtml(formatMoney(goal.currentAmount))}</td>
          <td class="right">${escapeHtml(formatMoney(goal.shortfall))}</td>
          <td>${goal.achieved ? "달성" : "진행 중"}</td>
        </tr>
      `)
      .join("")
    : "<tr><td colspan=\"5\">목표 없음</td></tr>";

  const actionRows = input.actions.length > 0
    ? input.actions
      .map((action, index) => {
        const steps = action.steps.length > 0
          ? `<ul>${action.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>`
          : "";
        return `
          <article class="card">
            <h3>[${index + 1}] ${escapeHtml(action.title)}</h3>
            <p>${escapeHtml(action.summary)}</p>
            ${steps}
          </article>
        `;
      })
      .join("")
    : "<p>권장 액션이 없습니다.</p>";

  const diagnostics = input.diagnostics.length > 0
    ? input.diagnostics
      .map((diag) => `
        <article class="card">
          <h3>${escapeHtml(diag.title)}</h3>
          <p><strong>${escapeHtml(diag.evidence)}</strong></p>
          <p>${escapeHtml(diag.description)}</p>
          ${diag.evidenceDetail ? `
            <details class="card" style="margin-top:8px;">
              <summary>계산 근거</summary>
              <p>공식: ${escapeHtml(diag.evidenceDetail.formula)}</p>
              <p>입력:</p>
              <ul>
                ${Object.entries(diag.evidenceDetail.inputs).map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(typeof value === "string" ? value : String(value ?? "-"))}</li>`).join("")}
              </ul>
              <p>가정:</p>
              <ul>
                ${diag.evidenceDetail.assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join("")}
              </ul>
            </details>
          ` : ""}
        </article>
      `)
      .join("")
    : "<p>진단 데이터가 없습니다.</p>";

  const policy = asRecord(input.reproducibility?.policy);
  const policyDsr = asRecord(policy.dsr);
  const policyEmergency = asRecord(policy.emergencyFundMonths);
  const policySurplus = asRecord(policy.monthlySurplusKrw);
  const policySnapshot = asRecord(policy.snapshot);
  const policyWarning = asRecord(policy.warnings);
  const policyLines = [
    `DSR caution/risk: ${asNumber(policyDsr.cautionPct) ?? "-"} / ${asNumber(policyDsr.riskPct) ?? "-"}`,
    `Emergency months caution/risk: ${asNumber(policyEmergency.caution) ?? "-"} / ${asNumber(policyEmergency.risk) ?? "-"}`,
    `Surplus cautionMax/riskMax: ${asNumber(policySurplus.cautionMax) ?? "-"} / ${asNumber(policySurplus.riskMax) ?? "-"}`,
    `Snapshot stale caution/risk days: ${asNumber(policySnapshot.staleCautionDays) ?? "-"} / ${asNumber(policySnapshot.staleRiskDays) ?? "-"}`,
    `Warnings caution count: ${asNumber(policyWarning.cautionCount) ?? "-"}`,
  ];
  const policyRows = policyLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const overrideRows = (input.reproducibility?.appliedOverrides ?? []).length > 0
    ? (input.reproducibility?.appliedOverrides ?? [])
      .map((override) => `<li>${escapeHtml(override.key)}=${escapeHtml(String(override.value))}${override.reason ? ` (${escapeHtml(override.reason)})` : ""} · ${escapeHtml(override.updatedAt)}</li>`)
      .join("")
    : "<li>적용된 오버라이드 없음</li>";

  const reproducibilityBlock = input.reproducibility
    ? `
  <section>
    <h2>Reproducibility (Advanced)</h2>
    <details class=\"card\">
      <summary>메타데이터 펼치기</summary>
      <p class=\"muted\">runId: ${escapeHtml(input.reproducibility.runId)} / createdAt: ${escapeHtml(input.reproducibility.createdAt)}</p>
      <ul>
        <li>assumptionsSnapshotId: ${escapeHtml(input.reproducibility.assumptionsSnapshotId ?? "-")}</li>
        <li>staleDays: ${typeof input.reproducibility.staleDays === "number" ? input.reproducibility.staleDays : "-"}</li>
        <li>appVersion: ${escapeHtml(input.reproducibility.appVersion)}</li>
        <li>engineVersion: ${escapeHtml(input.reproducibility.engineVersion)}</li>
        <li>profileHash: ${escapeHtml(input.reproducibility.profileHash.slice(0, 12))}</li>
        <li>assumptionsHash: ${escapeHtml((input.reproducibility.assumptionsHash ?? "").slice(0, 12) || "-")}</li>
        <li>effectiveAssumptionsHash: ${escapeHtml((input.reproducibility.effectiveAssumptionsHash ?? "").slice(0, 12) || "-")}</li>
      </ul>
      <p class=\"muted\">Applied overrides</p>
      <ul>${overrideRows}</ul>
      <ul>${policyRows}</ul>
    </details>
  </section>`
    : "";

  const printModeScript = input.printView
    ? "<script>window.addEventListener('load', () => { window.print(); });</script>"
    : "";

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Planning Report ${escapeHtml(input.runId)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #0f172a; }
  h1, h2 { margin: 0 0 10px; }
  h1 { font-size: 22px; }
  h2 { font-size: 18px; margin-top: 22px; }
  h3 { margin: 0 0 8px; font-size: 14px; }
  .muted { color: #64748b; font-size: 11px; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  td.right { text-align: right; }
  .note { border: 1px solid #fef3c7; background: #fffbeb; color: #78350f; border-radius: 8px; padding: 8px 10px; font-size: 12px; }
  section, .card, table, tr, td, th { break-inside: avoid; }
  @media print {
    html, body { margin: 0; padding: 0; overflow: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    section { page-break-inside: avoid; margin-bottom: 12px; }
    .grid { gap: 8px; }
    .note { page-break-inside: avoid; }
  }
</style>
${printModeScript}
</head>
<body>
  <header>
    <h1>Planning Run Report</h1>
    <p class="muted">runId: ${escapeHtml(input.runId)} / reportId: ${escapeHtml(input.reportId)} / createdAt: ${escapeHtml(input.createdAt)}</p>
  </header>

  <section>
    <h2>Executive Summary</h2>
    <div class="card">
      <p><strong>10초 판정: ${escapeHtml(input.verdict.label)}</strong></p>
      <p>${escapeHtml(input.verdict.headline)}</p>
    </div>
    <div class="grid">
      <div class="card"><h3>월 잉여현금</h3><p>${escapeHtml(formatMoney(input.summaryCards.monthlySurplusKrw))}</p></div>
      <div class="card"><h3>DSR</h3><p>${escapeHtml(formatPct(input.summaryCards.dsrPct))}</p></div>
      <div class="card"><h3>비상금(개월)</h3><p>${typeof input.summaryCards.emergencyFundMonths === "number" ? `${input.summaryCards.emergencyFundMonths.toFixed(1)}개월` : "-"}</p></div>
      <div class="card"><h3>총부채</h3><p>${escapeHtml(formatMoney(input.summaryCards.debtTotalKrw))}</p></div>
    </div>
  </section>

  <section>
    <h2>Diagnostics</h2>
    <div class="grid">${diagnostics}</div>
  </section>

  <section>
    <h2>Warnings</h2>
    <table>
      <thead>
        <tr><th>경고</th><th>심각도</th><th>횟수</th><th>기간</th><th>설명</th></tr>
      </thead>
      <tbody>${warningRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Goals</h2>
    <table>
      <thead>
        <tr><th>목표</th><th>목표액</th><th>현재</th><th>부족액</th><th>상태</th></tr>
      </thead>
      <tbody>${goalRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Action Plan</h2>
    <div class="grid">${actionRows}</div>
  </section>

  ${reproducibilityBlock}

  <p class="note">이 리포트는 참고용이며 수익/손실을 보장하지 않습니다. 투자/대출 권유 문서가 아닙니다.</p>
</body>
</html>`;
}
