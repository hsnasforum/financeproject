import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { type StoredTransaction } from "@/lib/planning/v3/domain/transactions";
import { applyAccountMappingOverrides } from "@/lib/planning/v3/service/applyAccountMappingOverrides";
import { detectTransfers } from "@/lib/planning/v3/service/detectTransfers";
import { readBatchTransactions } from "@/lib/planning/v3/service/transactionStore";
import { getBatchTransactions } from "@/lib/planning/v3/store/batchesStore";
import { getAccountMappingOverrides } from "@/lib/planning/v3/store/accountMappingOverridesStore";
import { getTransferOverrides } from "@/lib/planning/v3/store/txnTransferOverridesStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
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

function toStored(batchId: string, rows: Awaited<ReturnType<typeof readBatchTransactions>>): StoredTransaction[] {
  if (!rows) return [];
  return rows.transactions
    .map((row) => ({
      ...row,
      txnId: asString(row.txnId).toLowerCase(),
      batchId,
    }))
    .filter((row) => row.txnId.length > 0);
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const [legacy, stored, accountOverrides, transferOverrides] = await Promise.all([
      readBatchTransactions(id),
      getBatchTransactions(id),
      getAccountMappingOverrides(id).catch(() => ({})),
      getTransferOverrides(id).catch(() => ({})),
    ]);

    const transactions = stored.length > 0 ? stored : toStored(id, legacy);
    if (transactions.length < 1) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치 거래를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const mapped = applyAccountMappingOverrides(transactions, accountOverrides);
    const detected = detectTransfers({
      batchId: id,
      transactions: mapped,
      overridesByTxnId: transferOverrides,
    });

    return NextResponse.json({
      ok: true,
      data: {
        detections: detected.detections,
        stats: {
          totalTxns: transactions.length,
          candidates: detected.candidateCount,
          transfers: detected.detections.length,
        },
        unassignedCount: detected.unassignedCount,
      },
    });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "이체 탐지 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
