import type { DiagnosticsSnapshot } from "../diagnostics/snapshot";

type FeedbackCategory = "bug" | "improve" | "question";

type FeedbackIssueItem = {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  message: string;
  traceId: string | null;
  userAgent: string | null;
  url: string | null;
  appVersion: string | null;
  snapshot?: DiagnosticsSnapshot;
};

type BuildIssueMarkdownOptions = {
  includeFullSnapshot?: boolean;
  maxSnapshotChars?: number;
};

const DEFAULT_MAX_SNAPSHOT_CHARS = 20_000;

function categoryLabel(category: FeedbackCategory): string {
  if (category === "bug") return "버그";
  if (category === "improve") return "개선";
  return "질문";
}

function safeText(value: string | null | undefined, fallback = "-"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function safeDate(value: string | null | undefined): string {
  if (typeof value !== "string") return "-";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "-";
  return new Date(time).toISOString();
}

function codeFenceSafe(value: string): string {
  return value.replace(/```/g, "``\\`");
}

function formatErrorLine(error: DiagnosticsSnapshot["recentErrors"][number]): string {
  const time = safeDate(error.time);
  const code = safeText(error.code);
  const message = safeText(error.message);
  const route = safeText(error.route);
  const status = Number.isFinite(error.status) ? Math.max(0, Math.trunc(error.status)) : 0;
  return `- ${time} [${code}] ${message} (route: ${route}, status: ${status})`;
}

function summarizeDailyRefresh(snapshot?: DiagnosticsSnapshot): string[] {
  if (!snapshot?.dailyRefresh) {
    return ["- dailyRefresh: 없음"];
  }
  const daily = snapshot.dailyRefresh;
  const okCount = daily.steps.filter((step) => step.status === "ok").length;
  const skippedCount = daily.steps.filter((step) => step.status === "skipped").length;
  const failedCount = daily.steps.filter((step) => step.status === "failed").length;
  return [
    `- generatedAt: ${safeDate(daily.generatedAt)}`,
    `- ok: ${daily.ok ? "true" : "false"}`,
    `- steps: ${daily.steps.length} (ok ${okCount} / skipped ${skippedCount} / failed ${failedCount})`,
  ];
}

function summarizeDartArtifacts(snapshot?: DiagnosticsSnapshot): string[] {
  if (!snapshot) {
    return ["- dartArtifacts: 없음"];
  }
  const artifacts = snapshot.dartArtifacts;
  if (!artifacts.dirExists) {
    return ["- dirExists: false", "- items: 0"];
  }
  const existingCount = artifacts.items.filter((entry) => entry.exists).length;
  const latestUpdatedAt = artifacts.items
    .map((entry) => safeDate(entry.updatedAt))
    .filter((entry) => entry !== "-")
    .sort()
    .at(-1) ?? "-";
  return [
    `- dirExists: true`,
    `- items: ${artifacts.items.length} (exists ${existingCount})`,
    `- latestUpdatedAt: ${latestUpdatedAt}`,
  ];
}

function buildSnapshotBlock(snapshot: DiagnosticsSnapshot, maxChars: number): string {
  const serialized = JSON.stringify(snapshot, null, 2);
  if (serialized.length <= maxChars) {
    return serialized;
  }
  const suffix = "\n... [truncated]";
  const headLength = Math.max(0, maxChars - suffix.length);
  return `${serialized.slice(0, headLength)}${suffix}`;
}

export function buildIssueMarkdown(
  feedbackItem: FeedbackIssueItem,
  options: BuildIssueMarkdownOptions = {},
): string {
  const includeFullSnapshot = options.includeFullSnapshot ?? false;
  const maxSnapshotCharsRaw = options.maxSnapshotChars ?? DEFAULT_MAX_SNAPSHOT_CHARS;
  const maxSnapshotChars = Number.isFinite(maxSnapshotCharsRaw)
    ? Math.max(500, Math.trunc(maxSnapshotCharsRaw))
    : DEFAULT_MAX_SNAPSHOT_CHARS;

  const summaryLines = [
    `- 카테고리: ${categoryLabel(feedbackItem.category)} (${feedbackItem.category})`,
    `- 시간: ${safeDate(feedbackItem.createdAt)}`,
    `- URL: ${safeText(feedbackItem.url)}`,
    `- TraceId: ${safeText(feedbackItem.traceId)}`,
    `- AppVersion: ${safeText(feedbackItem.appVersion)}`,
  ];

  const recentErrors = feedbackItem.snapshot?.recentErrors?.slice(0, 5) ?? [];
  const recentErrorLines = recentErrors.length > 0
    ? recentErrors.map((error) => formatErrorLine(error))
    : ["- 최근 오류 없음"];

  const lines: string[] = [
    "# Feedback Issue Template",
    "",
    "## 요약",
    ...summaryLines,
    "",
    "## 현상",
    codeFenceSafe(safeText(feedbackItem.message, "메시지가 비어 있습니다.")),
    "",
    "## 재현 절차",
    "1. ",
    "2. ",
    "3. ",
    "",
    "## 기대 동작",
    "- ",
    "",
    "## 실제 동작",
    "- ",
    "",
    "## 진단 요약",
    "### 최근 오류 Top5",
    ...recentErrorLines,
    "",
    "### Daily Refresh",
    ...summarizeDailyRefresh(feedbackItem.snapshot),
    "",
    "### DART Artifacts",
    ...summarizeDartArtifacts(feedbackItem.snapshot),
  ];

  if (includeFullSnapshot && feedbackItem.snapshot) {
    const snapshotText = buildSnapshotBlock(feedbackItem.snapshot, maxSnapshotChars);
    lines.push(
      "",
      "## Snapshot JSON",
      "<details>",
      "<summary>진단 스냅샷 (접기/펼치기)</summary>",
      "",
      "```json",
      codeFenceSafe(snapshotText),
      "```",
      "</details>",
    );
  }

  lines.push("");
  return lines.join("\n");
}

