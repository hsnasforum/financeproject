import { answerQuestion, type PlanningQuestion } from "./qa";
import { type PlanResultV2 } from "./types";

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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function stringifyJson(value: unknown): string {
  return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function summarizePlan(plan: PlanResultV2): string[] {
  const last = plan.timeline[plan.timeline.length - 1];
  const worst = plan.timeline.reduce(
    (best, row, index) => (row.liquidAssets < best.value ? { value: row.liquidAssets, month: index } : best),
    { value: Number.POSITIVE_INFINITY, month: 0 },
  );
  return [
    `- 말기 순자산: ${toMoney(last?.netWorth ?? 0)}`,
    `- 최저 현금: ${toMoney(Number.isFinite(worst.value) ? worst.value : 0)} (${worst.month + 1}개월차)`,
    `- 목표 달성: ${plan.goalStatus.filter((goal) => goal.achieved).length}/${plan.goalStatus.length}`,
    `- 경고 수: ${plan.warnings.length}`,
  ];
}

function summarizeActions(actions: unknown): string[] {
  const rows = asArray(asRecord(actions).actions);
  if (rows.length === 0) return ["- 없음"];
  return rows.slice(0, 10).map((row) => {
    const item = asRecord(row);
    return `- ${String(item.code ?? "UNKNOWN")}: ${String(item.title ?? "")}`.trim();
  });
}

export function toMarkdownReport(input: ReportInput): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const title = input.title?.trim() || "Planning v2 Report";
  const questions: PlanningQuestion[] = input.questions ?? [
    "WHY_GOAL_MISSED",
    "WHY_CASH_LOW",
    "WHY_DEBT_RISKY",
    "WHAT_ASSUMPTIONS_MATTER",
  ];

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- GeneratedAt: ${generatedAt}`);
  lines.push(`- Snapshot ID: ${input.snapshot?.id ?? "latest"}`);
  lines.push(`- Snapshot asOf: ${input.snapshot?.asOf ?? "-"}`);
  lines.push(`- Snapshot fetchedAt: ${input.snapshot?.fetchedAt ?? "-"}`);
  lines.push(`- Snapshot missing: ${input.snapshot?.missing === true ? "true" : "false"}`);
  if (input.assumptionsLabel) {
    lines.push(`- Assumptions: ${input.assumptionsLabel}`);
  }
  lines.push("");

  lines.push("## Summary");
  lines.push(...summarizePlan(input.plan));
  lines.push("");

  lines.push("## Warnings");
  if (input.plan.warnings.length === 0) {
    lines.push("- 없음");
  } else {
    for (const warning of input.plan.warnings) {
      lines.push(`- [${warning.reasonCode}] ${warning.message}`);
    }
  }
  lines.push("");

  lines.push("## Goals");
  if (input.plan.goalStatus.length === 0) {
    lines.push("- 없음");
  } else {
    for (const goal of input.plan.goalStatus) {
      lines.push(`- ${goal.name} (${goal.goalId}): achieved=${goal.achieved ? "Y" : "N"}, shortfall=${toMoney(goal.shortfall)}`);
    }
  }
  lines.push("");

  lines.push("## Decision Traces");
  const traces = input.plan.traces ?? [];
  if (traces.length === 0) {
    lines.push("- 없음");
  } else {
    for (const trace of traces.slice(0, 30)) {
      lines.push(`- [${trace.code}] ${trace.message}${typeof trace.monthIndex === "number" ? ` (month ${trace.monthIndex + 1})` : ""}`);
    }
  }
  lines.push("");

  lines.push("## Scenarios Diff");
  lines.push(input.scenarios ? stringifyJson(input.scenarios) : "- 없음");
  lines.push("");

  lines.push("## Monte Carlo");
  lines.push(input.monteCarlo ? stringifyJson(input.monteCarlo) : "- 없음");
  lines.push("");

  lines.push("## Actions");
  lines.push(...summarizeActions(input.actions));
  lines.push("");

  lines.push("## Q&A");
  for (const question of questions) {
    const answer = answerQuestion(question, input.plan);
    lines.push(`### ${answer.title}`);
    for (const bullet of answer.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push(`- Evidence: ${answer.evidenceCodes.join(", ") || "N/A"}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
