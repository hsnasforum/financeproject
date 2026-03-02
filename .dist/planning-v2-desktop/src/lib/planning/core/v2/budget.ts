export type BudgetDecision =
  | { ok: true }
  | { ok: false; code: string; message: string; data?: Record<string, unknown> };

const MAX_MONTE_CARLO_PATHS = 20_000;
const MAX_HORIZON_MONTHS = 1_200;
const MAX_WORK_UNITS = 8_000_000;

export function checkMonteCarloBudget(args: { paths: number; horizonMonths: number }): BudgetDecision {
  const paths = Math.trunc(Number(args.paths));
  const horizonMonths = Math.trunc(Number(args.horizonMonths));

  if (!Number.isFinite(paths) || paths < 1 || paths > MAX_MONTE_CARLO_PATHS) {
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      message: `paths는 1~${MAX_MONTE_CARLO_PATHS} 범위여야 합니다.`,
      data: {
        paths,
        maxPaths: MAX_MONTE_CARLO_PATHS,
      },
    };
  }

  if (!Number.isFinite(horizonMonths) || horizonMonths < 1 || horizonMonths > MAX_HORIZON_MONTHS) {
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      message: `horizonMonths는 1~${MAX_HORIZON_MONTHS} 범위여야 합니다.`,
      data: {
        horizonMonths,
        maxHorizonMonths: MAX_HORIZON_MONTHS,
      },
    };
  }

  const workUnits = paths * horizonMonths;
  if (workUnits > MAX_WORK_UNITS) {
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      message: `요청 계산량이 예산을 초과했습니다. paths*horizon=${workUnits.toLocaleString("en-US")} > ${MAX_WORK_UNITS.toLocaleString("en-US")}`,
      data: {
        paths,
        horizonMonths,
        workUnits,
        maxWorkUnits: MAX_WORK_UNITS,
      },
    };
  }

  return { ok: true };
}
