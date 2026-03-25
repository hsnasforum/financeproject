import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  getDraft,
  listDrafts,
} from "@/lib/planning/v3/drafts/draftStore";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import {
  isSaveDraftFromImportForbiddenError,
  isSaveDraftFromImportInputError,
  saveDraftFromImport,
} from "@/lib/planning/v3/draft/service";

type DraftBody = {
  csrf?: unknown;
  source?: unknown;
  payload?: unknown;
  cashflow?: unknown;
  draftPatch?: unknown;
  meta?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickCsrfToken(request: Request, body?: DraftBody): string {
  const header = request.headers.get("x-csrf-token");
  if (header && header.trim()) return header.trim();
  const bodyCsrf = asString(body?.csrf);
  if (bodyCsrf) return bodyCsrf;
  const url = new URL(request.url);
  return asString(url.searchParams.get("csrf"));
}

function withReadGuard(request: Request): NextResponse | null {
  try {
    assertSameOrigin(request);
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

function withWriteGuard(request: Request, body: DraftBody): NextResponse | null {
  try {
    assertSameOrigin(request);
    requireCsrf(request, { csrf: pickCsrfToken(request, body) }, { allowWhenCookieMissing: true });
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
  const incomes = cashflow.map((row) => asNumber(row.incomeKrw)).sort((a, b) => a - b);
  const expenses = cashflow.map((row) => Math.abs(asNumber(row.expenseKrw))).sort((a, b) => a - b);
  const netAvg = Math.round(cashflow.reduce((sum, row) => sum + asNumber(row.netKrw), 0) / cashflow.length);
  const median = (items: number[]): number => {
    if (items.length < 1) return 0;
    const mid = Math.floor(items.length / 2);
    if (items.length % 2 === 1) return items[mid] ?? 0;
    return Math.round(((items[mid - 1] ?? 0) + (items[mid] ?? 0)) / 2);
  };
  return {
    medianIncomeKrw: median(incomes),
    medianExpenseKrw: median(expenses),
    avgNetKrw: netAvg,
  };
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  try {
    const rows = await listDrafts();
    const details = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      draft: await getDraft(row.id),
    })));
    const detailById = new Map(details.map((entry) => [entry.id, entry.draft]));
    const payload = {
      ok: true,
      drafts: rows.map((row) => {
        const draft = detailById.get(row.id);
        const summary = summarizeDraft(draft?.monthlyCashflow ?? []);
        return {
          id: row.id,
          createdAt: row.createdAt,
          source: {
            kind: "csv" as const,
            ...(row.source.filename ? { filename: row.source.filename } : {}),
            rows: row.meta.rowsParsed,
            columns: row.meta.columnsCount,
            months: draft?.monthlyCashflow.length ?? 0,
          },
          summary,
          meta: row.meta,
        };
      }),
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
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 목록을 조회하지 못했습니다." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: DraftBody = null;
  try {
    body = (await request.json()) as DraftBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  try {
    const payload = isRecord(body?.payload)
      ? body?.payload
      : ({
        cashflow: Array.isArray(body?.cashflow) ? body?.cashflow : [],
        draftPatch: isRecord(body?.draftPatch) ? body?.draftPatch : {},
      });
    const created = await saveDraftFromImport({
      source: body?.source,
      payload,
      meta: body?.meta,
    });

    const response = {
      ok: true,
      id: created.id,
      draftId: created.id,
      createdAt: created.createdAt,
      data: {
        id: created.id,
        createdAt: created.createdAt,
      },
    };
    assertNoForbiddenDraftKeys(response);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (isSaveDraftFromImportForbiddenError(error) || error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "초안 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    if (isSaveDraftFromImportInputError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: error.message } },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "초안 식별자 생성에 실패했습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
