import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  GenerateDraftPatchFromBatchError,
  generateDraftPatchFromBatch,
} from "@/lib/planning/v3/service/generateDraftPatchFromBatch";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { planningStorageErrorResponse } from "@/lib/planning/api/storageErrorResponse";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
    const csrf = asString(new URL(request.url).searchParams.get("csrf"));
    requireCsrf(request, { csrf }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const batchId = asString(new URL(request.url).searchParams.get("batchId"));
  if (!batchId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "상담 자료 번호가 필요합니다." }, meta: userMeta },
      { status: 400 },
    );
  }

  try {
    const built = await generateDraftPatchFromBatch({ batchId });
    return NextResponse.json({
      ok: true,
      meta: {
        ...userMeta,
        batchId,
      },
      data: {
        draftPatch: {
          monthlyIncomeNet: built.draftPatch.monthlyIncomeNet,
          monthlyEssentialExpenses: built.draftPatch.monthlyEssentialExpenses,
          monthlyDiscretionaryExpenses: built.draftPatch.monthlyDiscretionaryExpenses,
          assumptions: built.draftPatch.assumptions,
          monthsConsidered: built.draftPatch.monthsConsidered,
        },
        evidence: {
          monthsUsed: built.evidence.monthsUsed,
          ymStats: built.evidence.ymStats.map((row) => ({
            ym: row.ym,
            incomeKrw: row.incomeKrw,
            expenseKrw: row.expenseKrw,
            fixedExpenseKrw: row.fixedExpenseKrw,
            variableExpenseKrw: row.variableExpenseKrw,
            debtExpenseKrw: row.debtExpenseKrw,
            transferKrw: row.transferKrw,
          })),
          byCategoryStats: built.evidence.byCategoryStats.map((row) => ({
            categoryId: row.categoryId,
            totalKrw: row.totalKrw,
          })),
          medians: {
            incomeKrw: built.evidence.medians.incomeKrw,
            expenseKrw: built.evidence.medians.expenseKrw,
            fixedExpenseKrw: built.evidence.medians.fixedExpenseKrw,
            variableExpenseKrw: built.evidence.medians.variableExpenseKrw,
            debtExpenseKrw: built.evidence.medians.debtExpenseKrw,
          },
          ruleCoverage: {
            total: built.evidence.ruleCoverage.total,
            override: built.evidence.ruleCoverage.override,
            rule: built.evidence.ruleCoverage.rule,
            default: built.evidence.ruleCoverage.default,
            transfer: built.evidence.ruleCoverage.transfer,
          },
        },
        assumptions: built.assumptions,
      },
    });
  } catch (error) {
    const storageError = planningStorageErrorResponse(error, userMeta);
    if (storageError) return storageError;
    if (error instanceof GenerateDraftPatchFromBatchError) {
      if (error.code === "INPUT") {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "상담 자료 번호 형식이 올바르지 않습니다." }, meta: userMeta },
          { status: 400 },
        );
      }
      if (error.code === "NOT_FOUND") {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "해당 상담 자료를 찾을 수 없습니다." }, meta: userMeta },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "상담 정보 초안을 만들 거래 데이터가 부족합니다." }, meta: userMeta },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "상담 자료 번호 형식이 올바르지 않습니다." }, meta: userMeta },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "상담 정보 초안 미리보기를 계산하지 못했습니다." }, meta: userMeta },
      { status: 500 },
    );
  }
}
