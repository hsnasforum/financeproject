import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readTodayCache, readTrendsCache } from "../news/store";
import { shiftKstDay } from "../news/trend";
import { sanitizeV3LogMessage } from "../security/whitelist";

const ScenarioNameOrder: Record<string, number> = {
  Base: 0,
  Bull: 1,
  Bear: 2,
};

const WeeklyReportTopicSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  burstGrade: z.enum(["High", "Med", "Low", "Unknown"]),
  sourceDiversity: z.number().finite().min(0).max(1),
});

const WeeklyReportEvidenceSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  publishedAt: z.string().datetime().nullable(),
  topics: z.array(z.string().trim().min(1)).max(3),
});

const WeeklyReportScenarioSchema = z.object({
  name: z.enum(["Base", "Bull", "Bear"]),
  signalGrade: z.enum(["High", "Med", "Low", "Unknown"]),
  linkedTopics: z.array(z.string().trim().min(1)).max(3),
  observation: z.string().trim().min(1),
});

const WeeklyReportSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  weekRange: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    windowDays: z.union([z.literal(7), z.literal(30)]),
  }),
  lastRefreshedAt: z.string().datetime().nullable(),
  totals: z.object({
    topicCount: z.number().int().nonnegative(),
    topicArticleCount: z.number().int().nonnegative(),
    evidenceLinkCount: z.number().int().nonnegative(),
    scenarioCount: z.number().int().nonnegative(),
  }),
  topics: z.array(WeeklyReportTopicSchema),
  evidence: z.array(WeeklyReportEvidenceSchema),
  scenarios: z.array(WeeklyReportScenarioSchema),
});

export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;

export type BuildWeeklyHtmlReportInput = {
  rootDir?: string;
  windowDays?: 7 | 30;
};

export type BuildWeeklyHtmlReportResult = {
  report: WeeklyReport;
  html: string;
};

export type RunWeeklyHtmlReportExportInput = BuildWeeklyHtmlReportInput & {
  cwd?: string;
  out?: string;
};

export type RunWeeklyHtmlReportExportResult = BuildWeeklyHtmlReportResult & {
  outputPath: string;
};

type CliArgs = {
  cwd: string;
  out?: string;
  windowDays: 7 | 30;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBurstGrade(value: string): "High" | "Med" | "Low" | "Unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "상") return "High";
  if (normalized === "med" || normalized === "중") return "Med";
  if (normalized === "low" || normalized === "하") return "Low";
  return "Unknown";
}

function gradeRank(value: string): number {
  const normalized = normalizeBurstGrade(value);
  if (normalized === "High") return 3;
  if (normalized === "Med") return 2;
  if (normalized === "Low") return 1;
  return 0;
}

function rankToGrade(value: number): "High" | "Med" | "Low" | "Unknown" {
  if (value >= 3) return "High";
  if (value >= 2) return "Med";
  if (value >= 1) return "Low";
  return "Unknown";
}

function toPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function escapeHtml(value: unknown): string {
  const text = asString(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function pickGeneratedAt(values: string[]): string {
  const filtered = values
    .map((row) => asString(row))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (filtered.length < 1) {
    throw new Error("CACHE_MISSING:generatedAt");
  }
  return filtered[filtered.length - 1] ?? "";
}

function buildScenarioSignalGrade(
  linkedTopics: string[],
  topicGradeMap: Map<string, "High" | "Med" | "Low" | "Unknown">,
  triggerConditions: string[],
): "High" | "Med" | "Low" | "Unknown" {
  let bestRank = 0;

  for (const topicId of linkedTopics) {
    bestRank = Math.max(bestRank, gradeRank(topicGradeMap.get(topicId) ?? "Unknown"));
  }
  for (const condition of triggerConditions) {
    bestRank = Math.max(bestRank, gradeRank(condition));
  }

  return rankToGrade(bestRank);
}

function resolveOutputPath(cwd: string, out?: string): string {
  const safeOut = asString(out);
  if (!safeOut) {
    return path.join(cwd, ".data", "news", "reports", "weekly.latest.html");
  }
  return path.isAbsolute(safeOut) ? safeOut : path.resolve(cwd, safeOut);
}

export function buildWeeklyHtmlReport(input: BuildWeeklyHtmlReportInput = {}): BuildWeeklyHtmlReportResult {
  const rootDir = input.rootDir ?? path.join(process.cwd(), ".data", "news");
  const windowDays = input.windowDays ?? 7;

  const today = readTodayCache(rootDir);
  if (!today) {
    throw new Error("CACHE_MISSING:today.latest.json");
  }
  const trends = readTrendsCache(windowDays, rootDir);
  if (!trends) {
    throw new Error(`CACHE_MISSING:trends.${windowDays}d.latest.json`);
  }

  const topicRows = trends.topics
    .map((row) => ({
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      count: row.count,
      burstGrade: normalizeBurstGrade(row.burstGrade),
      sourceDiversity: row.sourceDiversity,
    }))
    .sort((a, b) => {
      const gradeDiff = gradeRank(b.burstGrade) - gradeRank(a.burstGrade);
      if (gradeDiff !== 0) return gradeDiff;
      if (a.count !== b.count) return b.count - a.count;
      if (a.sourceDiversity !== b.sourceDiversity) return b.sourceDiversity - a.sourceDiversity;
      return a.topicId.localeCompare(b.topicId);
    });

  const topicLabelMap = new Map(topicRows.map((row) => [row.topicId, row.topicLabel] as const));
  const topicGradeMap = new Map(topicRows.map((row) => [row.topicId, row.burstGrade] as const));

  const evidence = [...today.digest.evidence].sort((a, b) => {
    const aPublishedAt = a.publishedAt ?? "";
    const bPublishedAt = b.publishedAt ?? "";
    const timeDiff = bPublishedAt.localeCompare(aPublishedAt);
    if (timeDiff !== 0) return timeDiff;
    const urlDiff = a.url.localeCompare(b.url);
    if (urlDiff !== 0) return urlDiff;
    return a.title.localeCompare(b.title);
  });

  const scenarioRows = [...today.scenarios.cards]
    .sort((a, b) => {
      const orderDiff = (ScenarioNameOrder[a.name] ?? 99) - (ScenarioNameOrder[b.name] ?? 99);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    })
    .map((row) => ({
      name: row.name,
      signalGrade: buildScenarioSignalGrade(
        row.linkedTopics,
        topicGradeMap,
        row.triggers.map((trigger) => trigger.condition),
      ),
      linkedTopics: row.linkedTopics.map((topicId) => topicLabelMap.get(topicId) ?? topicId),
      observation: row.observation,
    }));

  const report = WeeklyReportSchema.parse({
    schemaVersion: 1,
    generatedAt: pickGeneratedAt([today.generatedAt, trends.generatedAt, today.scenarios.generatedAt]),
    weekRange: {
      from: shiftKstDay(trends.date, -(windowDays - 1)),
      to: trends.date,
      windowDays,
    },
    lastRefreshedAt: today.lastRefreshedAt,
    totals: {
      topicCount: topicRows.length,
      topicArticleCount: topicRows.reduce((sum, row) => sum + row.count, 0),
      evidenceLinkCount: evidence.length,
      scenarioCount: scenarioRows.length,
    },
    topics: topicRows,
    evidence,
    scenarios: scenarioRows,
  });

  const topicTableRows = report.topics
    .map((row) => `
          <tr>
            <td>${escapeHtml(row.topicLabel)}</td>
            <td class="right">${escapeHtml(String(row.count))}</td>
            <td>${escapeHtml(row.burstGrade)}</td>
            <td class="right">${escapeHtml(toPercent(row.sourceDiversity))}</td>
          </tr>`)
    .join("");

  const evidenceRows = report.evidence
    .map((row) => `
          <li>
            <a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(row.title)}</a>
            <span class="muted">${escapeHtml(row.sourceId)} · ${escapeHtml(row.publishedAt ?? "-")} · ${escapeHtml(row.topics.join(", "))}</span>
          </li>`)
    .join("");

  const scenarioRowsHtml = report.scenarios
    .map((row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.signalGrade)}</td>
            <td>${escapeHtml(row.linkedTopics.join(", "))}</td>
            <td>${escapeHtml(row.observation)}</td>
          </tr>`)
    .join("");

  const html = [
    "<!doctype html>",
    "<html lang=\"ko\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "  <title>V3 Weekly News Report</title>",
    "  <style>",
    "    :root { color-scheme: light; }",
    "    body { font-family: \"Pretendard\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", sans-serif; margin: 24px; color: #0f172a; background: #f8fafc; }",
    "    h1,h2 { margin: 0 0 10px; }",
    "    h2 { margin-top: 24px; }",
    "    .meta { color: #475569; margin-bottom: 16px; font-size: 14px; }",
    "    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }",
    "    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }",
    "    .card .label { color: #64748b; font-size: 12px; }",
    "    .card .value { font-size: 20px; font-weight: 700; margin-top: 4px; }",
    "    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; }",
    "    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: 14px; vertical-align: top; }",
    "    th { background: #f1f5f9; font-weight: 700; }",
    "    td.right, th.right { text-align: right; }",
    "    ul { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 18px; margin: 0; }",
    "    li { margin: 8px 0; }",
    "    .muted { display: block; color: #64748b; font-size: 12px; margin-top: 3px; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <h1>V3 주간 뉴스 요약 리포트</h1>",
    `  <p class="meta">기간: ${escapeHtml(report.weekRange.from)} ~ ${escapeHtml(report.weekRange.to)} (${escapeHtml(String(report.weekRange.windowDays))}일) · 생성: ${escapeHtml(report.generatedAt)} · 마지막 갱신: ${escapeHtml(report.lastRefreshedAt ?? "-")}</p>`,
    "  <section class=\"cards\">",
    `    <article class="card"><div class="label">주제 수</div><div class="value">${escapeHtml(String(report.totals.topicCount))}</div></article>`,
    `    <article class="card"><div class="label">주제 기사 수(합계)</div><div class="value">${escapeHtml(String(report.totals.topicArticleCount))}</div></article>`,
    `    <article class="card"><div class="label">근거 링크 수</div><div class="value">${escapeHtml(String(report.totals.evidenceLinkCount))}</div></article>`,
    `    <article class="card"><div class="label">시나리오 수</div><div class="value">${escapeHtml(String(report.totals.scenarioCount))}</div></article>`,
    "  </section>",
    "  <h2>토픽 요약</h2>",
    "  <table>",
    "    <thead><tr><th>토픽</th><th class=\"right\">기사 수</th><th>버스트 등급</th><th class=\"right\">소스 다양성</th></tr></thead>",
    `    <tbody>${topicTableRows || "<tr><td colspan=\"4\">데이터 없음</td></tr>"}</tbody>`,
    "  </table>",
    "  <h2>근거 링크</h2>",
    `  <ul>${evidenceRows || "<li>데이터 없음</li>"}</ul>`,
    "  <h2>시나리오 요약</h2>",
    "  <table>",
    "    <thead><tr><th>시나리오</th><th>신호 등급</th><th>연결 토픽</th><th>관찰</th></tr></thead>",
    `    <tbody>${scenarioRowsHtml || "<tr><td colspan=\"4\">데이터 없음</td></tr>"}</tbody>`,
    "  </table>",
    "</body>",
    "</html>",
  ].join("\n");

  return { report, html };
}

export function runWeeklyHtmlReportExport(input: RunWeeklyHtmlReportExportInput = {}): RunWeeklyHtmlReportExportResult {
  const cwd = input.cwd ?? process.cwd();
  const rootDir = input.rootDir ?? path.join(cwd, ".data", "news");
  const outputPath = resolveOutputPath(cwd, input.out);
  const built = buildWeeklyHtmlReport({
    rootDir,
    windowDays: input.windowDays,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, built.html, "utf-8");
  return {
    ...built,
    outputPath,
  };
}

function parseArgs(argv: string[]): CliArgs {
  let cwd = process.cwd();
  let out: string | undefined;
  let windowDays: 7 | 30 = 7;

  for (let index = 0; index < argv.length; index += 1) {
    const token = asString(argv[index]);
    if (!token.startsWith("--")) continue;

    if (token.startsWith("--cwd=")) {
      cwd = path.resolve(token.slice("--cwd=".length));
      continue;
    }
    if (token === "--cwd") {
      cwd = path.resolve(asString(argv[index + 1]) || cwd);
      index += 1;
      continue;
    }

    if (token.startsWith("--out=")) {
      out = token.slice("--out=".length);
      continue;
    }
    if (token === "--out") {
      out = asString(argv[index + 1]) || out;
      index += 1;
      continue;
    }

    if (token.startsWith("--window=")) {
      windowDays = token.slice("--window=".length) === "30" ? 30 : 7;
      continue;
    }
    if (token === "--window") {
      windowDays = asString(argv[index + 1]) === "30" ? 30 : 7;
      index += 1;
    }
  }

  return { cwd, out, windowDays };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runWeeklyHtmlReportExport({
      cwd: args.cwd,
      out: args.out,
      windowDays: args.windowDays,
    });
    console.log(`[v3:report:weekly] output=${path.relative(args.cwd, result.outputPath)}`);
    console.log(
      `[v3:report:weekly] topics=${result.report.totals.topicCount} links=${result.report.totals.evidenceLinkCount} scenarios=${result.report.totals.scenarioCount}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(`[v3:report:weekly] failed: ${sanitizeV3LogMessage(message)}`);
    process.exitCode = 1;
  }
}
