import { buildUserInsight } from "../insights/interpret";
import { LIMITS } from "../limits";
import { summarizeRunDiff } from "../insights/whyChanged";
import { type ResultDtoV1 } from "../resultDto";

type RenderHtmlReportOptions = {
  title?: string;
  locale?: "ko-KR";
  theme?: "light";
  compareTo?: {
    dto: ResultDtoV1;
    label?: string;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toPct(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: string | undefined, locale: "ko-KR"): string {
  if (!value) return "-";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString(locale, { hour12: false });
}

function formatKrw(value: number | undefined, locale: "ko-KR"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `₩${Math.round(value).toLocaleString(locale)}`;
}

function formatPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function formatGoalStatus(achieved: boolean | undefined): string {
  if (achieved === true) return "달성";
  if (achieved === false) return "미달";
  return "-";
}

function formatWarningPeriod(firstMonth: number | undefined, lastMonth: number | undefined): string {
  if (typeof firstMonth !== "number" && typeof lastMonth !== "number") return "-";
  if (typeof firstMonth === "number" && typeof lastMonth === "number") {
    if (firstMonth === lastMonth) return `M${firstMonth + 1}`;
    return `M${firstMonth + 1}~M${lastMonth + 1}`;
  }
  if (typeof firstMonth === "number") return `M${firstMonth + 1}`;
  return `M${(lastMonth ?? 0) + 1}`;
}

function insightSeverityLabel(severity: "ok" | "warn" | "risk"): string {
  if (severity === "risk") return "위험";
  if (severity === "warn") return "주의";
  return "양호";
}

function buildAssumptionsSummary(dto: ResultDtoV1): Array<{ label: string; value: string }> {
  const simulate = asRecord(dto.raw?.simulate);
  const assumptionsUsed = asRecord(simulate.assumptionsUsed);

  const inflation = toPct(asNumber(assumptionsUsed.inflationPct) ?? asNumber(assumptionsUsed.annualInflationRate));
  const expected = toPct(asNumber(assumptionsUsed.expectedReturnPct) ?? asNumber(assumptionsUsed.annualExpectedReturnRate));
  const cash = toPct(asNumber(assumptionsUsed.cashReturnPct) ?? asNumber(assumptionsUsed.annualCashReturnRate));
  const withdrawal = toPct(asNumber(assumptionsUsed.withdrawalRatePct) ?? asNumber(assumptionsUsed.annualWithdrawalRate));

  return [
    { label: "정책", value: asString(dto.meta.policyId) || "기본" },
    { label: "물가상승률", value: formatPct(inflation) },
    { label: "기대수익률", value: formatPct(expected) },
    { label: "현금수익률", value: formatPct(cash) },
    { label: "인출률", value: formatPct(withdrawal) },
  ];
}

function buildInsight(dto: ResultDtoV1) {
  const startTimeline = dto.timeline.points.find((point) => point.label === "start");
  return buildUserInsight({
    summary: {
      endNetWorthKrw: dto.summary.endNetWorthKrw,
      worstCashKrw: dto.summary.worstCashKrw,
      worstCashMonthIndex: dto.summary.worstCashMonthIndex,
      dsrPct: dto.summary.dsrPct,
      monthlyExpensesKrw: startTimeline?.expensesKrw,
      goalsAchievedText: dto.summary.goalsAchieved
        ? `${dto.summary.goalsAchieved.achieved}/${dto.summary.goalsAchieved.total}`
        : undefined,
    },
    aggregatedWarnings: dto.warnings.aggregated.map((warning) => ({
      code: warning.code,
      severity: warning.severity === "critical"
        ? "critical"
        : warning.severity === "warn"
          ? "warn"
          : "info",
      count: warning.count,
      firstMonth: warning.firstMonth,
      lastMonth: warning.lastMonth,
      sampleMessage: warning.sampleMessage,
    })),
    goals: dto.goals.map((goal) => ({
      name: goal.title,
      targetAmount: asNumber(goal.targetKrw) ?? 0,
      currentAmount: asNumber(goal.currentKrw) ?? 0,
      shortfall: asNumber(goal.shortfallKrw) ?? 0,
      targetMonth: asNumber(goal.targetMonth) ?? 0,
      achieved: goal.achieved === true,
      achievedMonth: undefined,
      comment: goal.comment ?? "",
    })),
    actionsTop: dto.actions?.top3,
    snapshotMeta: {
      missing: dto.meta.snapshot.missing,
      staleDays: dto.meta.health?.snapshotStaleDays,
    },
    monteCarlo: {
      retirementDepletionBeforeEnd: asNumber(asRecord(dto.monteCarlo?.probabilities).retirementDepletionBeforeEnd),
    },
  });
}

export function renderHtmlReport(dto: ResultDtoV1, opts?: RenderHtmlReportOptions): string {
  const locale = opts?.locale ?? "ko-KR";
  const title = opts?.title ?? "재무설계 결과 리포트";
  const theme = opts?.theme ?? "light";
  const assumptions = buildAssumptionsSummary(dto);
  const insight = buildInsight(dto);

  const goalsText = dto.summary.goalsAchieved
    ? `${dto.summary.goalsAchieved.achieved}/${dto.summary.goalsAchieved.total}`
    : "-";

  const interpretationRows = [insight.headline, ...insight.bullets].slice(0, 3);
  const interpretationItems = interpretationRows.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const riskBadgeLabel = insightSeverityLabel(insight.severity);

  const warningRows = insight.translatedWarnings.slice(0, LIMITS.reportWarningsTop).map((warning) => {
    const period = warning.months
      ? formatWarningPeriod(warning.months.first, warning.months.last)
      : "-";
    const count = typeof warning.count === "number" ? String(warning.count) : "-";
    return `
      <tr>
        <td>${escapeHtml(warning.title)}</td>
        <td>${escapeHtml(warning.meaning)}</td>
        <td>${escapeHtml(warning.impact)}</td>
        <td>${escapeHtml(warning.suggestion)}</td>
        <td>${escapeHtml(`${count}회 / ${period}`)}</td>
      </tr>
    `;
  }).join("");

  const goalsRows = dto.goals.slice(0, LIMITS.goalsTop).map((goal) => `
    <tr>
      <td>${escapeHtml(goal.title)}</td>
      <td>${escapeHtml(formatKrw(goal.targetKrw, locale))}</td>
      <td>${escapeHtml(formatKrw(goal.currentKrw, locale))}</td>
      <td>${escapeHtml(formatKrw(goal.shortfallKrw, locale))}</td>
      <td>${escapeHtml(typeof goal.targetMonth === "number" ? `M${goal.targetMonth}` : "-")}</td>
      <td>${escapeHtml(formatGoalStatus(goal.achieved))}</td>
      <td>${escapeHtml(asString(goal.comment) || "-")}</td>
    </tr>
  `).join("");

  const actionItems = insight.nextSteps.slice(0, LIMITS.actionsTop).map((action) => (
    `<li><strong>${escapeHtml(action.title)}</strong> - ${escapeHtml(action.why)}</li>`
  )).join("");

  const assumptionsItems = assumptions.map((row) => `
    <li><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></li>
  `).join("");

  const monteProb = toPct(asNumber(asRecord(dto.monteCarlo?.probabilities).retirementDepletionBeforeEnd));
  const monteSection = dto.monteCarlo
    ? `
      <section class="section">
        <h2>Monte Carlo 요약</h2>
        <p>
          은퇴 전 자산 고갈 확률: <strong>${escapeHtml(formatPct(monteProb))}</strong>
          (모델 기반 결과이며 보장이 아닙니다)
        </p>
      </section>
    `
    : "";

  const debtSection = dto.debt
    ? `
      <section class="section">
        <h2>Debt 요약</h2>
        <p>DSR: <strong>${escapeHtml(formatPct(dto.debt.dsrPct))}</strong></p>
        <p>${escapeHtml((dto.debt.cautions ?? []).slice(0, 2).join(" · ") || "부채 관련 추가 주의사항이 없습니다.")}</p>
      </section>
    `
    : "";

  const whyChangedSection = opts?.compareTo
    ? (() => {
      const summary = summarizeRunDiff({
        base: opts.compareTo.dto,
        compare: dto,
        baseLabel: opts.compareTo.label ?? "이전 실행",
        compareLabel: "현재 실행",
      });
      const items = summary.bullets.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
      return `
        <section class="section">
          <h2>Changes vs previous run</h2>
          <p class="sub" style="margin:0 0 6px 0;">${escapeHtml(summary.headline)}</p>
          <ul>${items}</ul>
        </section>
      `;
    })()
    : "";

  const lightTheme = theme === "light";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: ${lightTheme ? "light" : "light"};
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --line: #e2e8f0;
      --warn: #b45309;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
      color: var(--text);
      font: 14px/1.55 "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    }
    .page {
      width: 210mm;
      margin: 0 auto;
      padding: 14mm;
      min-height: 297mm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 14px;
      border-bottom: 2px solid var(--line);
      padding-bottom: 10px;
    }
    .header h1 { margin: 0; font-size: 22px; }
    .sub { color: var(--muted); font-size: 12px; }
    .section {
      margin: 12px 0;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      break-inside: avoid;
    }
    .section h2 {
      margin: 0 0 8px 0;
      font-size: 15px;
      color: #0f172a;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #f8fafc;
    }
    .card .label { font-size: 11px; color: var(--muted); }
    .card .value { margin-top: 3px; font-size: 18px; font-weight: 700; }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 50px;
      border-radius: 999px;
      border: 1px solid transparent;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.4;
    }
    .badge-risk {
      color: #b91c1c;
      border-color: #fecaca;
      background: #fef2f2;
    }
    .badge-warn {
      color: #b45309;
      border-color: #fde68a;
      background: #fffbeb;
    }
    .badge-ok {
      color: #166534;
      border-color: #bbf7d0;
      background: #f0fdf4;
    }
    .meta-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 12px;
      font-size: 12px;
    }
    .meta-list li { display: flex; justify-content: space-between; gap: 8px; }
    .meta-list span { color: var(--muted); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 6px;
      vertical-align: top;
      text-align: left;
    }
    th { background: #f1f5f9; }
    ul { margin: 8px 0 0 18px; padding: 0; }
    .checklist li { margin-bottom: 6px; }
    .footer-note {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed var(--line);
      color: var(--warn);
      font-size: 12px;
      font-weight: 600;
    }
    @media print {
      body { background: #fff; }
      .page { margin: 0; width: auto; min-height: auto; padding: 8mm; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">생성 시각: ${escapeHtml(formatDateTime(dto.meta.generatedAt, locale))}</div>
      </div>
      <div class="sub">Snapshot: ${escapeHtml(dto.meta.snapshot.id || "latest")}</div>
    </header>

    <section class="section">
      <h2>기준정보(스냅샷/가정)</h2>
      <ul class="meta-list">
        <li><span>Snapshot ID</span><strong>${escapeHtml(dto.meta.snapshot.id || "latest")}</strong></li>
        <li><span>asOf</span><strong>${escapeHtml(dto.meta.snapshot.asOf || "-")}</strong></li>
        <li><span>fetchedAt</span><strong>${escapeHtml(formatDateTime(dto.meta.snapshot.fetchedAt, locale))}</strong></li>
        <li><span>staleDays</span><strong>${escapeHtml(typeof dto.meta.health?.snapshotStaleDays === "number" ? String(dto.meta.health.snapshotStaleDays) : "-")}</strong></li>
        ${assumptionsItems}
      </ul>
    </section>

    <section class="section">
      <h2>Executive Summary</h2>
      <p style="margin:0 0 10px 0;">
        <span class="badge ${insight.severity === "risk" ? "badge-risk" : insight.severity === "warn" ? "badge-warn" : "badge-ok"}">${escapeHtml(riskBadgeLabel)}</span>
      </p>
      <div class="cards">
        <article class="card"><div class="label">말기 순자산</div><div class="value">${escapeHtml(formatKrw(dto.summary.endNetWorthKrw, locale))}</div></article>
        <article class="card"><div class="label">최저 현금</div><div class="value">${escapeHtml(formatKrw(dto.summary.worstCashKrw, locale))}</div></article>
        <article class="card"><div class="label">목표 달성</div><div class="value">${escapeHtml(goalsText)}</div></article>
        <article class="card"><div class="label">DSR</div><div class="value">${escapeHtml(formatPct(toPct(dto.summary.dsrPct)))}</div></article>
      </div>
      <h3 style="margin:10px 0 0 0;font-size:13px;">해석 문장</h3>
      <ul>${interpretationItems}</ul>
    </section>

    <section class="section">
      <h2>Key Findings Top3</h2>
      <ul>${interpretationItems}</ul>
    </section>

    <section class="section">
      <h2>Warnings Summary</h2>
      <table>
        <thead>
          <tr><th>경고 항목</th><th>의미</th><th>영향</th><th>다음 조치</th><th>발생</th></tr>
        </thead>
        <tbody>
          ${warningRows || '<tr><td colspan="5">경고 없음</td></tr>'}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Goals Table</h2>
      <table>
        <thead>
          <tr><th>목표명</th><th>목표액</th><th>현재</th><th>부족액</th><th>목표월</th><th>상태</th><th>코멘트</th></tr>
        </thead>
        <tbody>
          ${goalsRows || '<tr><td colspan="7">목표 정보 없음</td></tr>'}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Action Plan Top3</h2>
      <ul class="checklist">${actionItems || "<li>우선순위 행동 항목이 없습니다.</li>"}</ul>
    </section>

    ${whyChangedSection}
    ${monteSection}
    ${debtSection}

    <p class="footer-note">본 리포트는 가정 기반 계산 결과이며 수익/성과를 보장하지 않고 투자 권유가 아닙니다.</p>
  </main>
</body>
</html>`;
}
