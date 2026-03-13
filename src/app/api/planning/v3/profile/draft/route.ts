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

  const batchId = asString(new URL(request.url).searchParams.get("batchId"));
  if (!batchId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "batchId가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const built = await generateDraftPatchFromBatch({ batchId });
    return NextResponse.json({
      ok: true,
      meta: {
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
    if (error instanceof GenerateDraftPatchFromBatchError) {
      if (error.code === "INPUT") {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "batchId 형식이 올바르지 않습니다." } },
          { status: 400 },
        );
      }
      if (error.code === "NOT_FOUND") {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 생성할 데이터가 부족합니다." } },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "batchId 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "프로필 초안 생성에 실패했습니다." } },
      { status: 500 },
    );
  }
}
