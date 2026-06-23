import { append as appendAuditLog } from "../../../audit/auditLogStore";
import { type BudgetDecision } from "./budget";

type RejectedBudgetDecision = Extract<BudgetDecision, { ok: false }>;

export function recordMonteCarloBudgetRejection(budget: RejectedBudgetDecision): void {
  try {
    appendAuditLog({
      event: "PLANNING_MONTE_CARLO_BUDGET",
      route: "/api/planning/v2/monte-carlo",
      summary: `PLANNING_MONTE_CARLO_BUDGET REJECTED: ${budget.message}`,
      details: {
        result: "REJECTED",
        code: budget.code,
        ...(budget.data ?? {}),
      },
    });
  } catch {
    // Audit failure must not hide the original budget rejection response.
  }
}
