import {
  NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import {
  deleteCurrentUserStoredBatch,
  getCurrentUserBatchDeleteSurface,
  loadCurrentUserBatchDetail,
  } from "@/lib/planning/v3/service/batchReadRepository";
import { buildStoredFirstVisibleBatchShell } from "@/lib/planning/v3/service/storedFirstVisibleBatchShell";
import { applyTxnOverrides } from "@/lib/planning/v3/service/applyOverrides";
import { resolveTxnCategoryId } from "@/lib/planning/v3/service/categorySemantics";
import { classifyTransactions } from "@/lib/planning/v3/service/classify";
import { getStoredFirstBatchDetailProjectionRows } from "@/lib/planning/v3/service/storedFirstVisibleRows";
import { toStoredFirstPublicImportBatchMeta } from "@/lib/planning/v3/service/storedFirstPublicMetadata";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { planningBatchLifecycleErrorResponse } from "@/lib/planning/api/batchLifecycleErrorResponse";
import { planningStorageErrorResponse } from "@/lib/planning/api/storageErrorResponse";

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

function toBatchDetailTransactions(rows: Array<
  Parameters<typeof resolveTxnCategoryId>[0] & {
    txnId?: string;
    accountId?: string;
    date: string;
    amountKrw: number;
    description?: string;
  }
>): Array<{
  txnId: string;
  accountId?: string;
  date: string;
  amountKrw: number;
  description?: string;
  kind: "income" | "expense" | "transfer";
  category: string;
  categoryId?: string;
}> {
  return rows
    .map((row) => {
      const txnId = asString(row.txnId).toLowerCase();
      if (!txnId) return null;
      const categoryId = resolveTxnCategoryId(row);
      return {
        txnId,
        ...(asString(row.accountId) ? { accountId: asString(row.accountId) } : {}),
        date: row.date,
        amountKrw: Math.round(Number(row.amountKrw) || 0),
        ...(toDisplayDescription(row.description) ? { description: toDisplayDescription(row.description) } : {}),
        kind: toDisplayKind(row.kind, row.amountKrw),
        category: categoryId ?? "unknown",
        ...(categoryId ? { categoryId } : {}),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function toBatchDetailSample(rows: Array<{
  date: string;
  amountKrw: number;
  description?: string;
  meta?: { rowIndex?: number };
}>): Array<{
  line: number;
  dateIso: string;
  amountKrw: number;
  descMasked?: string;
  ok: true;
}> {
  return rows.slice(0, 20).map((row) => ({
    line: row.meta?.rowIndex ?? 0,
    dateIso: row.date,
    amountKrw: row.amountKrw,
    ...(toDisplayDescription(row.description) ? { descMasked: toDisplayDescription(row.description) } : {}),
    ok: true,
  }));
}

function toBatchDetailStats(
  batch: Pick<ReturnType<typeof buildStoredFirstVisibleBatchShell>, "total" | "ok" | "failed">,
  rowMonthsSummary: Array<{ ym: string }>,
): {
  total: number;
  ok: number;
  failed: number;
  inferredMonths?: number;
} {
  // Detail `stats` reuses the same visible count boundary as the batch shell:
  // - total/ok/failed stay aligned with the currently resolved visible batch
  // - inferredMonths always reflects current raw/recovered row aggregation
  return {
    total: batch.total,
    ok: batch.ok,
    failed: batch.failed,
    ...(rowMonthsSummary.length > 0 ? { inferredMonths: rowMonthsSummary.length } : {}),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const { id } = await context.params;

    try {
      const { loaded, overridesByTxnId } = await loadCurrentUserBatchDetail(id);
      if (!loaded) {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." }, meta: userMeta },
          { status: 404 },
        );
      }

      // Detail keeps the raw snapshot for `data`, but the visible batch shell and derived
      // projections follow the same stored-first binding semantics that keep coexistence guarded.
      const { rawRows, derivedRows } = getStoredFirstBatchDetailProjectionRows(loaded);
      const classified = classifyTransactions({
        transactions: derivedRows,
      });
      const overridden = applyTxnOverrides(classified, overridesByTxnId);
      const transactions = toBatchDetailTransactions(overridden);
      const rowMonthsSummary = summarizeMonths(rawRows);
      const accountMonthlyNet = summarizeAccountMonthlyNet(derivedRows);
      const sample = toBatchDetailSample(derivedRows);
      const batch = buildStoredFirstVisibleBatchShell(loaded);
      const stats = toBatchDetailStats(batch, rowMonthsSummary);

      return NextResponse.json({
        ok: true,
        batch,
        sample,
        stats,
        monthsSummary: rowMonthsSummary,
        accountMonthlyNet,
        transactions,
        meta: {
          ...toStoredFirstPublicImportBatchMeta({
            meta: loaded.meta,
            metadataSource: loaded.policy.metadataSource,
          }),
          ...userMeta,
        },
        data: rawRows,
      });
    } catch (error) {
      const lifecycleError = planningBatchLifecycleErrorResponse(error, userMeta);
      if (lifecycleError) return lifecycleError;
      const storageError = planningStorageErrorResponse(error, userMeta);
      if (storageError) return storageError;
      if (isInvalidIdError(error)) {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." }, meta: userMeta },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "배치 상세 조회에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const { id } = await context.params;

    try {
      const { batchId, deleteSurface } = await getCurrentUserBatchDeleteSurface(id);
      if (deleteSurface === "missing") {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." }, meta: userMeta },
          { status: 404 },
        );
      }
      if (
        deleteSurface === "synthetic-stored-only-legacy-collision"
        || deleteSurface === "stored-meta-legacy-coexistence"
      ) {
        const message = deleteSurface === "stored-meta-legacy-coexistence"
            ? "같은 ID의 기존 배치가 남아 있어 지금 삭제하면 저장된 배치 정보와 파일만 제거됩니다."
            : "같은 ID의 기존 배치가 남아 있어 지금 삭제하면 저장 파일만 제거됩니다.";
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "INPUT",
              message,
            },
            meta: userMeta,
          },
          { status: 400 },
        );
      }
      await deleteCurrentUserStoredBatch(batchId);
      return NextResponse.json({ ok: true, deleted: true, meta: userMeta });
    } catch (error) {
      const lifecycleError = planningBatchLifecycleErrorResponse(error, userMeta);
      if (lifecycleError) return lifecycleError;
      const storageError = planningStorageErrorResponse(error, userMeta);
      if (storageError) return storageError;
      if (isInvalidIdError(error)) {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." }, meta: userMeta },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "배치 삭제에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
