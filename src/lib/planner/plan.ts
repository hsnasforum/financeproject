import { buildRecommendations, type Recommendation } from "@/lib/planner/rules";
import { computeMetrics, type PlannerInput, type PlannerMetrics } from "@/lib/planner/metrics";

export type ChecklistItem = {
  id: string;
  bucket: "이번 주" | "이번 달";
  label: string;
  reason: string;
  href?: string;
  playbookId?: string;
  sourceRuleId: string;
};

export type MonitoringPlan = {
  nextReviewDate: string;
  triggers: string[];
};

export type PlannerPlan = {
  metrics: PlannerMetrics;
  recommendations: Recommendation[];
  checklist: ChecklistItem[];
  monitoring: MonitoringPlan;
  summaryLine: string;
};

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toPriorityLabel(priority: Recommendation["priority"]): string {
  if (priority === "P0") return "최우선";
  if (priority === "P1") return "중요";
  return "점검";
}

function buildChecklist(recs: Recommendation[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  const playbookByRule: Record<string, string> = {
    R_EMG_01: "emg_account_split",
    R_DEBT_01: "debt_schedule_review",
    R_DEBT_02: "debt_schedule_review",
    R_EXP_01: "cap_variable_spend",
    R_GOAL_01: "find_saving_candidates",
  };

  for (const rec of recs) {
    const bucket: ChecklistItem["bucket"] = rec.priority === "P0" ? "이번 주" : "이번 달";
    const reason = rec.triggeredBy[0] ?? rec.rationale[0] ?? "규칙 기반 권고";
    const playbookId = playbookByRule[rec.id];

    if (rec.actions.length > 0) {
      for (const action of rec.actions.slice(0, 2)) {
        items.push({
          id: `${rec.id}-${action.label}`,
          bucket,
          label: `[${toPriorityLabel(rec.priority)}] ${action.label}`,
          reason,
          href: action.href,
          playbookId,
          sourceRuleId: rec.id,
        });
      }
    } else {
      items.push({
        id: `${rec.id}-default`,
        bucket,
        label: `[${toPriorityLabel(rec.priority)}] ${rec.title}`,
        reason,
        playbookId,
        sourceRuleId: rec.id,
      });
    }
  }

  return items;
}

function buildSummary(recs: Recommendation[]): string {
  const top = recs.slice(0, 3).map((r) => r.category);
  if (!top.length) {
    return "이번 달 우선순위는 계획 유지와 모니터링입니다.";
  }
  return `이번 달 우선순위는 ${top.join(" → ")} 입니다.`;
}

export function buildPlan(input: PlannerInput): PlannerPlan {
  const metrics = computeMetrics(input);
  const recommendations = buildRecommendations(input, metrics);
  const checklist = buildChecklist(recommendations);

  const monitoring: MonitoringPlan = {
    nextReviewDate: plusDaysISO(30),
    triggers: [
      "소득이 10% 이상 변동될 때",
      "월지출이 10% 이상 증가할 때",
      "부채금리가 변동되거나 신규대출이 생길 때",
      "목표금액/기한이 변경될 때",
    ],
  };

  return {
    metrics,
    recommendations,
    checklist,
    monitoring,
    summaryLine: buildSummary(recommendations),
  };
}

export type { PlannerInput, PlannerMetrics };
