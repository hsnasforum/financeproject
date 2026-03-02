import type { PlanningFeedback } from "./planningFeedbackTypes";

const DATA_PATH_PATTERN = /\.data\/[\w./-]+/gi;
const BEARER_PATTERN = /Bearer\s+[^\s"'`]+/gi;
const SECRET_ASSIGN_PATTERN = /\b(ECOS_API_KEY|BOK_ECOS_API_KEY|GITHUB_TOKEN(?:_[A-Z0-9_]+)?)\s*=\s*[^\s"'`]+/gi;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeText(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "";
  return raw
    .replace(DATA_PATH_PATTERN, "<DATA_PATH>")
    .replace(BEARER_PATTERN, "Bearer ***")
    .replace(SECRET_ASSIGN_PATTERN, "$1=***");
}

function parseCsvLabels(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of value.split(",")) {
    const label = sanitizeText(row).replace(/\s+/g, " ").slice(0, 50);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function normalizeLabels(labels: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of labels) {
    const label = sanitizeText(row).replace(/\s+/g, " ").slice(0, 50);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function priorityLabel(priority: PlanningFeedback["triage"]["priority"]): string {
  return priority.toLowerCase();
}

function categoryLabel(category: PlanningFeedback["content"]["category"]): string {
  if (category === "bug") return "bug";
  if (category === "ux") return "ux";
  if (category === "data") return "data";
  return "feedback";
}

function extractRepro(message: string): string[] {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const candidates = lines.filter((line) => /^\d+\./.test(line) || /^[-*]\s+/.test(line));
  if (candidates.length > 0) {
    return candidates.slice(0, 7);
  }
  return ["재현 정보 없음"];
}

export function buildIssueFromFeedback(fb: PlanningFeedback): { title: string; body: string; labels: string[] } {
  const prefix = sanitizeText(process.env.PLANNING_FEEDBACK_ISSUE_PREFIX) || "[Planning v2]";
  const baseLabels = parseCsvLabels(sanitizeText(process.env.PLANNING_FEEDBACK_ISSUE_LABELS) || "planning,feedback");
  const title = `${prefix} ${sanitizeText(fb.content.title)}`.trim().slice(0, 240);

  const snapshot = fb.context.snapshot;
  const health = fb.context.health;
  const warnings = (health?.warningsCodes ?? []).map((row) => sanitizeText(row)).filter((row) => row.length > 0).slice(0, 5);
  const message = sanitizeText(fb.content.message);
  const reproLines = extractRepro(message);

  const body = [
    "## Summary",
    `- category: ${sanitizeText(fb.content.category) || "-"}`,
    `- priority: ${sanitizeText(fb.triage.priority) || "-"}`,
    `- status: ${sanitizeText(fb.triage.status) || "-"}`,
    "",
    "## User Message",
    message || "-",
    "",
    "## Context",
    `- screen: ${sanitizeText(fb.from.screen) || "-"}`,
    `- snapshotRef: id=${sanitizeText(snapshot?.id) || "-"}, asOf=${sanitizeText(snapshot?.asOf) || "-"}, fetchedAt=${sanitizeText(snapshot?.fetchedAt) || "-"}, missing=${String(snapshot?.missing === true)}`,
    `- runId: ${sanitizeText(fb.context.runId) || "-"}`,
    `- reportId: ${sanitizeText(fb.context.reportId) || "-"}`,
    `- health.criticalCount: ${typeof health?.criticalCount === "number" ? health.criticalCount : "-"}`,
    `- health.warningsCodes(top5): ${warnings.length > 0 ? warnings.join(", ") : "-"}`,
    "",
    "## Reproduction Steps",
    ...reproLines.map((line, idx) => (/^\d+\./.test(line) || /^[-*]\s+/.test(line) ? line : `${idx + 1}. ${line}`)),
  ].join("\n");

  const labels = normalizeLabels([
    ...baseLabels,
    categoryLabel(fb.content.category),
    priorityLabel(fb.triage.priority),
  ]);

  return {
    title,
    body,
    labels,
  };
}
