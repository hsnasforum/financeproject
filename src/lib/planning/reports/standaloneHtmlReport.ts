import { type AssumptionsOverrideEntry } from "../assumptions/overrides";
import { type CalcEvidence } from "../calc";
import { roundKrw } from "../calc/roundingPolicy";

export type StandaloneReportRenderInput = {
  runId: string;
  reportId: string;
  createdAt: string;
  assumptionsLines: string[];
  summaryCards: {
    monthlySurplusKrw?: number;
    dsrPct?: number;
    emergencyFundMonths?: number;
    debtTotalKrw?: number;
    totalMonthlyDebtPaymentKrw?: number;
    endNetWorthKrw?: number;
    worstCashKrw?: number;
    goalsAchieved?: string;
    totalWarnings?: number;
  };
  monthlyOperatingGuide?: {
    headline: string;
    basisLabel: string;
    currentSplit: Array<{
      title: string;
      amountKrw: number;
      sharePct: number;
      tone: "slate" | "amber" | "rose" | "emerald";
      description: string;
    }>;
    nextPlanTitle: string;
    nextPlan: Array<{
      title: string;
      amountKrw?: number;
      sharePct?: number;
      tone: "slate" | "amber" | "rose" | "emerald";
      description: string;
    }>;
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
    severity?: "critical" | "warn" | "info";
    steps: string[];
  }>;
  scenarios?: Array<{
    title: string;
    endNetWorthKrw: number;
    worstCashKrw: number;
    goalsAchievedCount: number;
    warningsCount: number;
    interpretation: string;
  }>;
  monteCarlo?: {
    probabilities: Array<{
      label: string;
      value: string;
      interpretation: string;
    }>;
    percentiles: Array<{
      metric: string;
      p10: number;
      p50: number;
      p90: number;
    }>;
  };
  debtSummary?: Array<{
    name: string;
    repaymentType: string;
    principalKrw: number;
    aprPct?: number;
    monthlyPaymentKrw: number;
    monthlyInterestKrw: number;
    totalInterestRemainingKrw: number;
    payoffMonthIndex?: number;
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
  return `${roundKrw(n).toLocaleString("ko-KR")}원`;
}

function formatPct(value: unknown): string {
  const n = asNumber(value);
  if (typeof n !== "number") return "-";
  return `${n.toFixed(1)}%`;
}

function formatMonths(value: unknown): string {
  const n = asNumber(value);
  if (typeof n !== "number") return "-";
  return `${n.toFixed(1)}개월`;
}

function guideToneClass(tone: "slate" | "amber" | "rose" | "emerald"): string {
  if (tone === "rose") return "tone-rose";
  if (tone === "amber") return "tone-amber";
  if (tone === "emerald") return "tone-emerald";
  return "tone-slate";
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
            <p class="eyebrow">Top ${index + 1}${action.severity ? ` · ${escapeHtml(action.severity)}` : ""}</p>
            <h3>${escapeHtml(action.title)}</h3>
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

  const assumptionsBlock = input.assumptionsLines.length > 0
    ? `
  <section>
    <h2>실행 조건</h2>
    <div class="card">
      <ul>${input.assumptionsLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    </div>
  </section>`
    : "";

  const monthlyGuideBlock = input.monthlyOperatingGuide
    ? `
  <section>
    <h2>월급 운영 가이드</h2>
    <div class="card">
      <p><strong>${escapeHtml(input.monthlyOperatingGuide.headline)}</strong></p>
      <p>${escapeHtml(input.monthlyOperatingGuide.basisLabel)}</p>
    </div>
    <div class="grid">
      ${input.monthlyOperatingGuide.currentSplit.map((item) => `
        <article class="card ${guideToneClass(item.tone)}">
          <p class="muted">${escapeHtml(item.title)}</p>
          <h3>${escapeHtml(formatMoney(item.amountKrw))}</h3>
          <p class="muted">월 수입의 ${escapeHtml(formatPct(item.sharePct))}</p>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `).join("")}
    </div>
    <h3 style="margin-top:14px;">${escapeHtml(input.monthlyOperatingGuide.nextPlanTitle)}</h3>
    <div class="grid">
      ${input.monthlyOperatingGuide.nextPlan.map((item) => `
        <article class="card ${guideToneClass(item.tone)}">
          <p class="muted">${escapeHtml(item.title)}</p>
          ${typeof item.amountKrw === "number" ? `<h3>${escapeHtml(formatMoney(item.amountKrw))}</h3>` : ""}
          ${typeof item.sharePct === "number" ? `<p class="muted">기준 비중 ${escapeHtml(formatPct(item.sharePct))}</p>` : ""}
          <p>${escapeHtml(item.description)}</p>
        </article>
      `).join("")}
    </div>
  </section>`
    : "";

  const scenarioBlock = input.scenarios && input.scenarios.length > 0
    ? `
  <section>
    <h2>시나리오 비교</h2>
    <table>
      <thead>
        <tr><th>시나리오</th><th>말기 순자산</th><th>최저 현금</th><th>달성 목표 수</th><th>경고 수</th><th>해석</th></tr>
      </thead>
      <tbody>
        ${input.scenarios.map((row) => `
          <tr>
            <td>${escapeHtml(row.title)}</td>
            <td class="right">${escapeHtml(formatMoney(row.endNetWorthKrw))}</td>
            <td class="right">${escapeHtml(formatMoney(row.worstCashKrw))}</td>
            <td class="right">${row.goalsAchievedCount}</td>
            <td class="right">${row.warningsCount}</td>
            <td>${escapeHtml(row.interpretation)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </section>`
    : "";

  const monteBlock = input.monteCarlo && (input.monteCarlo.probabilities.length > 0 || input.monteCarlo.percentiles.length > 0)
    ? `
  <section>
    <h2>몬테카를로</h2>
    ${input.monteCarlo.probabilities.length > 0 ? `
      <div class="grid">
        ${input.monteCarlo.probabilities.map((row) => `
          <article class="card">
            <p class="muted">${escapeHtml(row.label)}</p>
            <h3>${escapeHtml(row.value)}</h3>
            <p>${escapeHtml(row.interpretation)}</p>
          </article>
        `).join("")}
      </div>
    ` : ""}
    ${input.monteCarlo.percentiles.length > 0 ? `
      <table>
        <thead>
          <tr><th>지표</th><th>P10</th><th>P50</th><th>P90</th></tr>
        </thead>
        <tbody>
          ${input.monteCarlo.percentiles.map((row) => `
            <tr>
              <td>${escapeHtml(row.metric)}</td>
              <td class="right">${escapeHtml(formatMoney(row.p10))}</td>
              <td class="right">${escapeHtml(formatMoney(row.p50))}</td>
              <td class="right">${escapeHtml(formatMoney(row.p90))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : ""}
  </section>`
    : "";

  const debtBlock = input.debtSummary && input.debtSummary.length > 0
    ? `
  <section>
    <h2>부채 요약</h2>
    <table>
      <thead>
        <tr><th>부채</th><th>상환방식</th><th>잔액</th><th>금리</th><th>월 상환액</th><th>월 이자</th><th>남은 총이자</th><th>상환완료</th></tr>
      </thead>
      <tbody>
        ${input.debtSummary.map((row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.repaymentType)}</td>
            <td class="right">${escapeHtml(formatMoney(row.principalKrw))}</td>
            <td class="right">${escapeHtml(formatPct(row.aprPct))}</td>
            <td class="right">${escapeHtml(formatMoney(row.monthlyPaymentKrw))}</td>
            <td class="right">${escapeHtml(formatMoney(row.monthlyInterestKrw))}</td>
            <td class="right">${escapeHtml(formatMoney(row.totalInterestRemainingKrw))}</td>
            <td class="right">${row.payoffMonthIndex ? `${row.payoffMonthIndex}개월차` : "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </section>`
    : "";

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
  :root { color-scheme: light; }
  body { font-family: "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #0f172a; background: linear-gradient(180deg, #f8fafc 0%, #ffffff 240px); }
  h1, h2 { margin: 0 0 10px; }
  h1 { font-size: 24px; }
  h2 { font-size: 18px; margin-top: 22px; }
  h3 { margin: 0 0 8px; font-size: 14px; }
  p, li { line-height: 1.55; }
  .muted { color: #64748b; font-size: 11px; }
  .eyebrow { color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 6px; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  td.right { text-align: right; }
  .note { border: 1px solid #fef3c7; background: #fffbeb; color: #78350f; border-radius: 8px; padding: 8px 10px; font-size: 12px; }
  .hero { border: 1px solid #dbeafe; background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%); border-radius: 18px; padding: 18px; margin-bottom: 18px; }
  .tone-slate { background: #f8fafc; }
  .tone-amber { background: #fffbeb; border-color: #fcd34d; }
  .tone-rose { background: #fff1f2; border-color: #fda4af; }
  .tone-emerald { background: #ecfdf5; border-color: #86efac; }
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
    <h1>플래닝 리포트</h1>
    <p class="muted">runId: ${escapeHtml(input.runId)} / reportId: ${escapeHtml(input.reportId)} / createdAt: ${escapeHtml(input.createdAt)}</p>
  </header>

  <section>
    <div class="hero">
      <p class="eyebrow">Executive Summary</p>
      <p><strong>10초 판정: ${escapeHtml(input.verdict.label)}</strong></p>
      <p>${escapeHtml(input.verdict.headline)}</p>
    </div>
    <h2>핵심 숫자</h2>
    <div class="grid">
      <div class="card"><h3>매달 남는 돈</h3><p>${escapeHtml(formatMoney(input.summaryCards.monthlySurplusKrw))}</p></div>
      <div class="card"><h3>대출 상환 비중</h3><p>${escapeHtml(formatPct(input.summaryCards.dsrPct))}</p></div>
      <div class="card"><h3>버틸 수 있는 비상금</h3><p>${escapeHtml(formatMonths(input.summaryCards.emergencyFundMonths))}</p></div>
      <div class="card"><h3>총 대출 잔액</h3><p>${escapeHtml(formatMoney(input.summaryCards.debtTotalKrw))}</p></div>
      <div class="card"><h3>말기 순자산</h3><p>${escapeHtml(formatMoney(input.summaryCards.endNetWorthKrw))}</p></div>
      <div class="card"><h3>최저 현금</h3><p>${escapeHtml(formatMoney(input.summaryCards.worstCashKrw))}</p></div>
      <div class="card"><h3>총 월상환액</h3><p>${escapeHtml(formatMoney(input.summaryCards.totalMonthlyDebtPaymentKrw))}</p></div>
      <div class="card"><h3>경고 수</h3><p>${typeof input.summaryCards.totalWarnings === "number" ? input.summaryCards.totalWarnings.toLocaleString("ko-KR") : "-"}</p></div>
    </div>
  </section>

  ${assumptionsBlock}
  ${monthlyGuideBlock}

  <section>
    <h2>판단 근거</h2>
    <div class="grid">${diagnostics}</div>
  </section>

  <section>
    <h2>주의가 필요한 부분</h2>
    <table>
      <thead>
        <tr><th>경고</th><th>심각도</th><th>횟수</th><th>기간</th><th>설명</th></tr>
      </thead>
      <tbody>${warningRows}</tbody>
    </table>
  </section>

  <section>
    <h2>목표 진행상황</h2>
    <table>
      <thead>
        <tr><th>목표</th><th>목표액</th><th>현재</th><th>부족액</th><th>상태</th></tr>
      </thead>
      <tbody>${goalRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Top Actions</h2>
    <div class="grid">${actionRows}</div>
  </section>

  ${scenarioBlock}
  ${monteBlock}
  ${debtBlock}
  ${reproducibilityBlock}

  <p class="note">이 리포트는 참고용이며 수익/손실을 보장하지 않습니다. 투자/대출 권유 문서가 아닙니다.</p>
</body>
</html>`;
}
