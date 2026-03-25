import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { type StoredTransaction } from "@/lib/planning/v3/domain/transactions";
import { applyAccountMappingOverrides } from "@/lib/planning/v3/service/applyAccountMappingOverrides";
import { categorizeTransactions } from "@/lib/planning/v3/service/categorizeTransactions";
import { computeCashflowBreakdown } from "@/lib/planning/v3/service/computeCashflowBreakdown";
import { detectTransfers } from "@/lib/planning/v3/service/detectTransfers";
import { getAccountMappingOverrides } from "@/lib/planning/v3/store/accountMappingOverridesStore";
import { listRules } from "@/lib/planning/v3/store/categoryRulesStore";
import { getTransferOverrides } from "@/lib/planning/v3/store/txnTransferOverridesStore";
import {
  getBatchTxnOverrides,
  getStoredFirstBatchSummaryProjectionRows,
  loadStoredFirstBatchTransactions,
} from "@/lib/planning/v3/transactions/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

function isInvalidIdError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid record id";
}

function toDescription(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  return text.slice(0, 80);
}

export async function GET(request: Request, context: RouteContext) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const [loaded, rules, overridesByTxnId, accountOverrides, transferOverrides] = await Promise.all([
      loadStoredFirstBatchTransactions(id),
      listRules(),
      getBatchTxnOverrides(id).catch(() => ({})),
      getAccountMappingOverrides(id).catch(() => ({})),
      getTransferOverrides(id).catch(() => ({})),
    ]);

    if (!loaded) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    // Categorized has no raw row payload, so it follows the same stored-first
    // visible binding projection as summary when same-id coexistence is present.
    const transactions: StoredTransaction[] = getStoredFirstBatchSummaryProjectionRows(loaded);

    const mappedTransactions = applyAccountMappingOverrides(transactions, accountOverrides);
    const transferDetected = detectTransfers({
      batchId: id,
      transactions: mappedTransactions,
      overridesByTxnId: transferOverrides,
    });
    const categorizedRows = transferDetected.transactions
      .map((row) => {
        const txnId = asString(row.txnId).toLowerCase();
        if (!txnId) return null;
        return {
          ...row,
          txnId,
          batchId: id,
        };
      })
      .filter((row): row is StoredTransaction => row !== null);

    const categorized = categorizeTransactions({
      transactions: categorizedRows,
      rules,
      overridesByTxnId,
    });
    const breakdown = computeCashflowBreakdown(categorized);

    return NextResponse.json({
      ok: true,
      meta: loaded.meta,
      data: categorized.map((row) => ({
        batchId: row.batchId,
        txnId: row.txnId,
        date: row.date,
        amountKrw: Math.round(Number(row.amountKrw) || 0),
        ...(toDescription(row.description) ? { description: toDescription(row.description) } : {}),
        accountId: asString(row.accountId) || "unassigned",
        kind: row.kind === "transfer" ? "transfer" : (row.amountKrw >= 0 ? "income" : "expense"),
        ...(asString(row.transferGroupId) ? { transferGroupId: asString(row.transferGroupId) } : {}),
        ...(row.transfer?.confidence ? { transferConfidence: row.transfer.confidence } : {}),
        categoryId: row.categoryId,
        categorySource: row.categorySource,
      })),
      breakdown,
    });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "카테고리 집계 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
