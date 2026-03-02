import type { PlanningFeedback } from "./planningFeedbackTypes";

function safe(value: string | undefined): string {
  return (value ?? "").trim() || "-";
}

function categoryLabel(category: PlanningFeedback["content"]["category"]): string {
  if (category === "bug") return "BUG";
  if (category === "ux") return "IMPROVE";
  if (category === "data") return "DATA";
  return "OTHER";
}

export function buildPlanningFeedbackIssueTemplate(item: PlanningFeedback): string {
  const snapshot = item.context.snapshot;
  const health = item.context.health;
  const warnings = health?.warningsCodes?.slice(0, 10).join(", ") || "-";

  return [
    `# [${categoryLabel(item.content.category)}] ${item.content.title}`,
    "",
    "## 증상",
    item.content.message,
    "",
    "## 재현 단계",
    "1. /planning에서 동일 입력으로 실행",
    "2. 동일 snapshot/run 컨텍스트로 재확인",
    "3. 결과 비교",
    "",
    "## 기대 결과",
    "- ",
    "",
    "## 실제 결과",
    "- ",
    "",
    "## 컨텍스트",
    `- screen: ${safe(item.from.screen)}`,
    `- snapshotRef: id=${safe(snapshot?.id)}, asOf=${safe(snapshot?.asOf)}, fetchedAt=${safe(snapshot?.fetchedAt)}, missing=${String(snapshot?.missing === true)}`,
    `- runId: ${safe(item.context.runId)}`,
    `- reportId: ${safe(item.context.reportId)}`,
    `- health.criticalCount: ${typeof health?.criticalCount === "number" ? health.criticalCount : "-"}`,
    `- health.warningsCodes: ${warnings}`,
    "",
    "## 게이트 결과",
    "- pnpm planning:v2:complete: PASS/FAIL",
    "- pnpm planning:v2:acceptance: PASS/FAIL",
  ].join("\n");
}

