import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { applyTxnOverrides } from "@/lib/planning/v3/service/applyOverrides";
import { classifyTransactions } from "@/lib/planning/v3/service/classify";
import { readBatch, readBatchTransactions } from "@/lib/planning/v3/service/transactionStore";
import { buildTxnId, normalizeDescriptionForTxnId } from "@/lib/planning/v3/service/txnId";
import { getBatchMeta, getBatchTransactions } from "@/lib/planning/v3/store/batchesStore";
import { type ImportBatchMeta, type StoredTransaction } from "@/lib/planning/v3/domain/transactions";
import { listOverrides } from "@/lib/planning/v3/store/txnOverridesStore";

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

function toDisplayDescription(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  return text.slice(0, 80);
}

function toDisplayKind(value: unknown, amountKrw: number): "income" | "expense" | "transfer" {
  const kind = asString(value);
  if (kind === "income" || kind === "expense" || kind === "transfer") return kind;
  return amountKrw >= 0 ? "income" : "expense";
}

function toDisplayCategory(value: unknown): "fixed" | "variable" | "saving" | "invest" | "unknown" {
  const category = asString(value);
  if (category === "fixed" || category === "variable" || category === "saving" || category === "invest" || category === "unknown") {
    return category;
  }
  return "unknown";
}

function toImportBatchMeta(batch: {
  id: string;
  createdAt: string;
  total: number;
  accountId?: string;
}, monthsSummary: Array<{ ym: string }>): ImportBatchMeta {
  const sortedMonths = monthsSummary
    .map((row) => asString(row.ym))
    .filter((row) => /^\d{4}-\d{2}$/.test(row))
    .sort((left, right) => left.localeCompare(right));

  return {
    id: batch.id,
    createdAt: batch.createdAt,
    source: "csv",
    rowCount: Math.max(0, Math.trunc(Number(batch.total) || 0)),
    ...(sortedMonths.length > 0 ? { ymMin: sortedMonths[0], ymMax: sortedMonths[sortedMonths.length - 1] } : {}),
    ...(asString(batch.accountId) ? { accounts: [{ id: asString(batch.accountId) }] } : {}),
  };
}

function summarizeMonths(rows: Array<{ date: string; amountKrw: number }>): Array<{
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
}> {
  const byMonth = new Map<string, {
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>();

  for (const row of rows) {
    const ym = asString(row.date).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const current = byMonth.get(ym) ?? {
      ym,
      incomeKrw: 0,
      expenseKrw: 0,
      netKrw: 0,
      txCount: 0,
    };
    if (row.amountKrw >= 0) current.incomeKrw += row.amountKrw;
    else current.expenseKrw += row.amountKrw;
    current.netKrw += row.amountKrw;
    current.txCount += 1;
    byMonth.set(ym, current);
  }

  return [...byMonth.values()].sort((left, right) => left.ym.localeCompare(right.ym));
}

function summarizeAccountMonthlyNet(rows: Array<{ accountId?: string; date: string; amountKrw: number }>): Array<{
  accountId: string;
  ym: string;
  netKrw: number;
  txCount: number;
}> {
  const grouped = new Map<string, {
    accountId: string;
    ym: string;
    netKrw: number;
    txCount: number;
  }>();

  for (const row of rows) {
    const accountId = asString(row.accountId);
    const ym = asString(row.date).slice(0, 7);
    if (!accountId || !/^\d{4}-\d{2}$/.test(ym)) continue;
    const key = `${accountId}:${ym}`;
    const current = grouped.get(key) ?? { accountId, ym, netKrw: 0, txCount: 0 };
    current.netKrw += Math.round(Number(row.amountKrw) || 0);
    current.txCount += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((left, right) => {
    const accountCmp = left.accountId.localeCompare(right.accountId);
    if (accountCmp !== 0) return accountCmp;
    return left.ym.localeCompare(right.ym);
  });
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;

  try {
    const [detail, batchTransactions, overridesByTxnId, storedMeta, storedTransactions] = await Promise.all([
      readBatch(id),
      readBatchTransactions(id),
      listOverrides(),
      getBatchMeta(id),
      getBatchTransactions(id),
    ]);

    if (detail) {
      const rawTransactions = batchTransactions?.transactions ?? [];
      const classified = classifyTransactions({ transactions: rawTransactions });
      const overridden = applyTxnOverrides(classified, overridesByTxnId);
      const transactions = overridden
        .map((row) => {
          const txnId = asString(row.txnId).toLowerCase();
          if (!txnId) return null;
          return {
            txnId,
            date: row.date,
            amountKrw: Math.round(Number(row.amountKrw) || 0),
            ...(toDisplayDescription(row.description) ? { description: toDisplayDescription(row.description) } : {}),
            kind: toDisplayKind(row.kind, row.amountKrw),
            category: toDisplayCategory(row.category),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      const data: StoredTransaction[] = rawTransactions
        .map((row) => {
          const txnId = asString(row.txnId).toLowerCase() || buildTxnId({
            dateIso: row.date,
            amountKrw: row.amountKrw,
            descNorm: normalizeDescriptionForTxnId(row.description),
            ...(asString(row.accountId) ? { accountId: asString(row.accountId) } : {}),
          });
          return {
            ...row,
            txnId,
            batchId: detail.batch.id,
          };
        })
        .sort((left, right) => {
          if (left.date !== right.date) return left.date.localeCompare(right.date);
          if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
          return left.txnId.localeCompare(right.txnId);
        });

      return NextResponse.json({
        ok: true,
        batch: detail.batch,
        sample: detail.sample,
        stats: detail.stats,
        monthsSummary: detail.monthsSummary,
        accountMonthlyNet: detail.accountMonthlyNet,
        transactions,
        meta: toImportBatchMeta(detail.batch, detail.monthsSummary),
        data,
      });
    }

    if (!storedMeta) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const classified = classifyTransactions({
      transactions: storedTransactions,
    });
    const overridden = applyTxnOverrides(classified, overridesByTxnId);
    const transactions = overridden
      .map((row) => {
        const txnId = asString(row.txnId).toLowerCase();
        if (!txnId) return null;
        return {
          txnId,
          date: row.date,
          amountKrw: Math.round(Number(row.amountKrw) || 0),
          ...(toDisplayDescription(row.description) ? { description: toDisplayDescription(row.description) } : {}),
          kind: toDisplayKind(row.kind, row.amountKrw),
          category: toDisplayCategory(row.category),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const monthsSummary = summarizeMonths(storedTransactions);
    const accountMonthlyNet = summarizeAccountMonthlyNet(storedTransactions);
    const batch = {
      id: storedMeta.id,
      createdAt: storedMeta.createdAt,
      kind: "csv" as const,
      total: storedMeta.rowCount,
      ok: storedMeta.rowCount,
      failed: 0,
      ...(storedMeta.accounts?.[0]?.id ? { accountId: storedMeta.accounts[0].id } : {}),
      ...(storedMeta.accounts?.[0]?.id ? { accountHint: storedMeta.accounts[0].id } : {}),
    };
    const sample = storedTransactions.slice(0, 20).map((row) => ({
      line: row.meta?.rowIndex ?? 0,
      dateIso: row.date,
      amountKrw: row.amountKrw,
      ...(toDisplayDescription(row.description) ? { descMasked: toDisplayDescription(row.description) } : {}),
      ok: true,
    }));

    return NextResponse.json({
      ok: true,
      batch,
      sample,
      stats: {
        total: storedMeta.rowCount,
        ok: storedMeta.rowCount,
        failed: 0,
        ...(monthsSummary.length > 0 ? { inferredMonths: monthsSummary.length } : {}),
      },
      monthsSummary,
      accountMonthlyNet,
      transactions,
      meta: storedMeta,
      data: storedTransactions,
    });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 상세 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;

  try {
    const existing = await getBatchMeta(id);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    const { deleteBatch } = await import("@/lib/planning/v3/store/batchesStore");
    await deleteBatch(id);
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 삭제에 실패했습니다." } },
      { status: 500 },
    );
  }
}
