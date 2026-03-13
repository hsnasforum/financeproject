import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  applyAccountMappingOverrides,
  buildTxnId,
  computeMonthlyBalances,
  detectTransfers,
  getAccountMappingOverrides,
  getBatchTransactions,
  getOpeningBalances,
  getTransferOverrides,
  listAccounts,
  listOverrides,
  normalizeDescriptionForTxnId,
  readBatchTransactions,
  type StoredTransaction,
} from "@/lib/planning/v3/balances/monthly";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: string | null): boolean {
  const normalized = asString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
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

function toStoredTransactions(batchId: string, rows: Awaited<ReturnType<typeof readBatchTransactions>>): StoredTransaction[] {
  if (!rows) return [];
  return rows.transactions.map((tx) => {
    const txnId = asString(tx.txnId).toLowerCase() || buildTxnId({
      dateIso: tx.date,
      amountKrw: tx.amountKrw,
      descNorm: normalizeDescriptionForTxnId(tx.description),
      ...(asString(tx.accountId) ? { accountId: asString(tx.accountId) } : {}),
    });
    return {
      ...tx,
      txnId,
      batchId,
    };
  });
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const batchId = asString(url.searchParams.get("batchId"));
  if (!batchId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "batchId를 입력해 주세요." } },
      { status: 400 },
    );
  }
  const includeTransfers = asBoolean(url.searchParams.get("includeTransfers"));

  try {
    const [
      storedByBatch,
      legacyByBatch,
      openingBalances,
      overridesByTxnId,
      accounts,
      accountOverrides,
      transferOverrides,
    ] = await Promise.all([
      getBatchTransactions(batchId),
      readBatchTransactions(batchId),
      getOpeningBalances(),
      listOverrides(),
      listAccounts(),
      getAccountMappingOverrides(batchId).catch(() => ({})),
      getTransferOverrides(batchId).catch(() => ({})),
    ]);

    const transactions = storedByBatch.length > 0
      ? storedByBatch
      : toStoredTransactions(batchId, legacyByBatch);
    if (transactions.length < 1) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치 거래를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const openingByAccount = { ...openingBalances };
    for (const account of accounts) {
      if (openingByAccount[account.id]) continue;
      if (Number.isInteger(account.startingBalanceKrw)) {
        openingByAccount[account.id] = {
          accountId: account.id,
          asOfDate: "1970-01-01",
          amountKrw: Number(account.startingBalanceKrw),
        };
      }
    }

    const mapped = applyAccountMappingOverrides(transactions, accountOverrides);
    const transferDetected = detectTransfers({
      batchId,
      transactions: mapped,
      overridesByTxnId: transferOverrides,
    });

    const computed = computeMonthlyBalances({
      transactions: transferDetected.transactions.map((row) => ({
        ...row,
        txnId: asString(row.txnId).toLowerCase(),
        batchId,
      })),
      openingBalancesByAccount: openingByAccount,
      includeTransfers,
      overridesByTxnId,
    });

    return NextResponse.json({
      ok: true,
      batchId,
      data: computed.data,
      warnings: computed.warnings,
      // Backward-compatible alias for existing UIs still reading `items`.
      items: computed.data,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "월별 잔액 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
