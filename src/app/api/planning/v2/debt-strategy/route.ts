import { fail, ok } from "../../../../../lib/planning/server/v2/apiResponse";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { type DebtStrategyInput, type LiabilityV2, type RefiOffer } from "../../../../../lib/planning/server/v2/debt/types";
import { toPlanningError } from "../../../../../lib/planning/server/v2/errors";
import { createPlanningService } from "../../../../../lib/planning/server/v2/service";
import { PlanningV2ValidationError } from "../../../../../lib/planning/server/v2/types";
import { validateProfileV2 } from "../../../../../lib/planning/server/v2/validate";

type DebtStrategyRequestBody = {
  profile?: unknown;
  offers?: unknown;
  options?: unknown;
  csrf?: unknown;
} | null;

const DEFAULT_REMAINING_MONTHS = 120;
const planningService = createPlanningService();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toIssueMessages(error: PlanningV2ValidationError): string[] {
  return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

function normalizeAprPct(value: number): number {
  if (Math.abs(value) <= 1) return value * 100;
  return value;
}

function parseOffers(value: unknown): RefiOffer[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new PlanningV2ValidationError("Invalid offers", [
      { path: "offers", message: "must be an array" },
    ]);
  }

  return value.map((row, index) => {
    if (!isRecord(row)) {
      throw new PlanningV2ValidationError("Invalid offers", [
        { path: `offers[${index}]`, message: "must be an object" },
      ]);
    }

    const liabilityId = typeof row.liabilityId === "string" ? row.liabilityId.trim() : "";
    if (!liabilityId) {
      throw new PlanningV2ValidationError("Invalid offers", [
        { path: `offers[${index}].liabilityId`, message: "must be a non-empty string" },
      ]);
    }

    if (!isFiniteNumber(row.newAprPct)) {
      throw new PlanningV2ValidationError("Invalid offers", [
        { path: `offers[${index}].newAprPct`, message: "must be a finite number" },
      ]);
    }

    if (row.feeKrw !== undefined && (!isFiniteNumber(row.feeKrw) || row.feeKrw < 0)) {
      throw new PlanningV2ValidationError("Invalid offers", [
        { path: `offers[${index}].feeKrw`, message: "must be >= 0 when provided" },
      ]);
    }

    const title = typeof row.title === "string" ? row.title.trim() : "";

    return {
      liabilityId,
      newAprPct: row.newAprPct,
      ...(row.feeKrw !== undefined ? { feeKrw: Math.round(row.feeKrw) } : {}),
      ...(title ? { title } : {}),
    };
  });
}

function parseOptions(value: unknown): DebtStrategyInput["options"] {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid options", [
      { path: "options", message: "must be an object" },
    ]);
  }

  const output: DebtStrategyInput["options"] = {};

  if (value.extraPaymentKrw !== undefined) {
    if (!isFiniteNumber(value.extraPaymentKrw) || value.extraPaymentKrw < 0) {
      throw new PlanningV2ValidationError("Invalid options", [
        { path: "options.extraPaymentKrw", message: "must be >= 0" },
      ]);
    }
    output.extraPaymentKrw = Math.round(value.extraPaymentKrw);
  }

  if (value.compareTermsMonths !== undefined) {
    if (!Array.isArray(value.compareTermsMonths)) {
      throw new PlanningV2ValidationError("Invalid options", [
        { path: "options.compareTermsMonths", message: "must be an array" },
      ]);
    }
    output.compareTermsMonths = value.compareTermsMonths.map((term, index) => {
      const parsed = Math.trunc(Number(term));
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new PlanningV2ValidationError("Invalid options", [
          { path: `options.compareTermsMonths[${index}]`, message: "must be >= 1" },
        ]);
      }
      return parsed;
    });
  }

  return output;
}

function toLiabilitiesFromProfile(profile: ReturnType<typeof validateProfileV2>): LiabilityV2[] {
  return profile.debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, debt.balance),
    aprPct: normalizeAprPct(debt.apr ?? 0),
    remainingMonths: Math.max(1, debt.remainingMonths ?? DEFAULT_REMAINING_MONTHS),
    minimumPaymentKrw: Math.max(0, debt.minimumPayment),
  }));
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    if (hasCsrfCookie(request)) {
      assertCsrf(request, body);
    }
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      const normalized = toPlanningError(error);
      return fail(normalized.code, normalized.message);
    }
    const normalized = toPlanningError(guard);
    return fail(normalized.code, normalized.message, { status: guard.status });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DebtStrategyRequestBody = null;
  try {
    body = (await request.json()) as DebtStrategyRequestBody;
  } catch {
    body = null;
  }

  if (!isRecord(body)) {
    return fail("INPUT");
  }
  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  try {
    const profile = validateProfileV2(body.profile);
    const offers = parseOffers(body.offers);
    const options = parseOptions(body.options);

    const monthlyIncomeKrw = Math.max(
      0,
      profile.cashflow?.monthlyIncomeKrw ?? profile.monthlyIncomeNet,
    );

    const result = planningService.computeDebtStrategy({
      liabilities: toLiabilitiesFromProfile(profile),
      monthlyIncomeKrw,
      offers,
      options,
      nowMonthIndex: 0,
      horizonMonths: DEFAULT_REMAINING_MONTHS,
    });

    return ok(result, {
      generatedAt: new Date().toISOString(),
      snapshot: {
        missing: true,
      },
    });
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return fail("INPUT", undefined, { issues: toIssueMessages(error) });
    }
    return fail("INTERNAL");
  }
}
