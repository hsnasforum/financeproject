import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  deleteDraft,
  getDraft,
} from "@/lib/planning/v3/drafts/draftStore";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DeleteBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function pickCsrfToken(request: Request, body?: DeleteBody): string {
  const header = request.headers.get("x-csrf-token");
  if (header && header.trim()) return header.trim();
  const bodyToken = asString(body?.csrf);
  if (bodyToken) return bodyToken;
  return asString(new URL(request.url).searchParams.get("csrf"));
}

function withReadGuard(request: Request): NextResponse | null {
  try {
    assertLocalHost(request);
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

function withWriteGuard(request: Request, body: DeleteBody): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertCsrf(request, { csrf: pickCsrfToken(request, body) });
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

function summarizeDraft(cashflow: Array<{ incomeKrw: number; expenseKrw: number; netKrw: number }>): {
  medianIncomeKrw?: number;
  medianExpenseKrw?: number;
  avgNetKrw?: number;
} {
  if (cashflow.length < 1) return {};
  const median = (rows: number[]): number => {
    const sorted = [...rows].sort((left, right) => left - right);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
    return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  };
  const incomes = cashflow.map((row) => asNumber(row.incomeKrw));
  const expenses = cashflow.map((row) => Math.abs(asNumber(row.expenseKrw)));
  const avgNet = Math.round(cashflow.reduce((sum, row) => sum + asNumber(row.netKrw), 0) / cashflow.length);
  return {
    medianIncomeKrw: median(incomes),
    medianExpenseKrw: median(expenses),
    avgNetKrw: avgNet,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const draft = await getDraft(id);
    if (!draft) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    const summary = summarizeDraft(draft.payload.cashflow);
    const payload = {
      ok: true,
      draft: {
        id: draft.id,
        createdAt: draft.createdAt,
        source: {
          kind: "csv" as const,
          ...(draft.source.filename ? { filename: draft.source.filename } : {}),
          rows: draft.meta.rows,
          columns: draft.meta.columns,
          months: draft.payload.cashflow.length,
        },
        summary,
        cashflow: draft.payload.cashflow,
        draftPatch: draft.payload.draftPatch,
      },
      data: draft,
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "초안 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "draft id 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 상세 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DeleteBody = null;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const { id } = await context.params;
  try {
    const deleted = await deleteDraft(id);
    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    const payload = { ok: true, deleted: true, data: { deleted: true } };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "draft id 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 삭제에 실패했습니다." } },
      { status: 500 },
    );
  }
}
