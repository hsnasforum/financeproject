import { type AssumptionsV2 } from "../v2/scenarios";
import { type ProfileV2 } from "../v2/types";
import { maskPlan, maskProfile, type MaskLevel } from "./mask";

export const SHARE_REPORT_WATERMARK = "가정 기반이며 보장이 아니며, 투자/가입 권유가 아닙니다.";

export type ShareReportWarning = {
  code: string;
  message?: string;
};

export type ShareReportAction = {
  code: string;
  title?: string;
  summary?: string;
};

export type ShareReportMonteCarlo = {
  probabilities?: Record<string, unknown>;
};

export type ShareMarkdownInput = {
  runId: string;
  level?: MaskLevel;
  generatedAt?: string;
  profile?: ProfileV2 | null;
  summary?: Record<string, unknown> | null;
  warnings?: ShareReportWarning[];
  actions?: ShareReportAction[];
  monteCarlo?: ShareReportMonteCarlo | null;
  assumptions?: Partial<AssumptionsV2> | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asPct(value: unknown): string {
  if (!isFiniteNumber(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function pickProbabilityLines(probabilities: Record<string, unknown> | undefined): string[] {
  if (!probabilities) return [];
  const preferredKeys = [
    "retirementDepletionBeforeEnd",
    "retirementAchievedAtRetireAge",
    "emergencyAchievedByMonth",
  ];

  const lines: string[] = [];
  for (const key of preferredKeys) {
    if (lines.length >= 2) break;
    const value = probabilities[key];
    if (isFiniteNumber(value)) {
      lines.push(`- ${key}: ${(value * 100).toFixed(2)}%`);
    }
  }
  if (lines.length >= 2) return lines;

  for (const [key, value] of Object.entries(probabilities)) {
    if (lines.length >= 2) break;
    if (isFiniteNumber(value)) {
      lines.push(`- ${key}: ${(value * 100).toFixed(2)}%`);
    }
  }
  return lines;
}

function warningLine(warning: ShareReportWarning): string {
  const code = asString(warning.code) || "UNKNOWN";
  const message = asString(warning.message) || "가정/입력값을 점검하세요.";
  return `- ${code}: ${message}`;
}

function actionLine(action: ShareReportAction): string {
  const title = asString(action.title) || asString(action.code) || "ACTION";
  const summary = asString(action.summary);
  return summary ? `- ${title}: ${summary}` : `- ${title}`;
}

export function toShareMarkdown(input: ShareMarkdownInput): string {
  const level = input.level ?? "standard";
  const generatedAt = input.generatedAt && Number.isFinite(Date.parse(input.generatedAt))
    ? new Date(input.generatedAt).toISOString()
    : new Date().toISOString();

  const maskedProfile = input.profile ? maskProfile(input.profile, level) : null;
  const maskedSummary = input.summary ? maskPlan(input.summary, level) : {};
  const warnings = (input.warnings ?? []).slice(0, 10);
  const actions = (input.actions ?? []).slice(0, 5);
  const probabilityLines = pickProbabilityLines(input.monteCarlo?.probabilities);
  const assumptions = input.assumptions ?? {};

  const sections: string[] = [
    "# Planning Share Report",
    "",
    `- runId: ${asString(input.runId) || "-"}`,
    `- generatedAt: ${generatedAt}`,
    `- maskLevel: ${level}`,
    `- 워터마크: ${SHARE_REPORT_WATERMARK}`,
    "",
    "## Summary",
    "```json",
    JSON.stringify(maskedSummary, null, 2),
    "```",
    "",
    "## Warnings",
    ...(warnings.length > 0 ? warnings.map(warningLine) : ["- 없음"]),
    "",
    "## Actions (Top 5)",
    ...(actions.length > 0 ? actions.map(actionLine) : ["- 없음"]),
    "",
    "## Monte Carlo (요약)",
    ...(probabilityLines.length > 0 ? probabilityLines : ["- 없음"]),
    "",
    "## Assumptions",
    `- inflationPct: ${asPct(assumptions.inflationPct)}`,
    `- cashReturnPct: ${asPct(assumptions.cashReturnPct)}`,
    `- investReturnPct: ${asPct(assumptions.investReturnPct)}`,
    "",
    "## Masked Profile (선택)",
    maskedProfile ? "```json" : "- 없음",
  ];

  if (maskedProfile) {
    sections.push(JSON.stringify(maskedProfile, null, 2));
    sections.push("```");
  }

  sections.push("");
  sections.push(`> ${SHARE_REPORT_WATERMARK}`);
  sections.push("");

  return sections.join("\n");
}
