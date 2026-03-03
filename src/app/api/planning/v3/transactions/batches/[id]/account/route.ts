import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  TransactionStoreInputError,
  updateBatchAccount,
} from "@/lib/planning/v3/service/transactionStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Body = {
  accountId?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withWriteGuard(request: Request, body: Body): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(body?.csrf) }, { allowWhenCookieMissing: true });
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

export async function POST(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: Body = null;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const accountId = asString(body?.accountId);
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "거래 계좌를 선택해 주세요." } },
      { status: 400 },
    );
  }

  const { id } = await context.params;

  try {
    const updated = await updateBatchAccount(id, accountId);
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      batch: updated.batch,
      updatedTransactionCount: updated.updatedTransactionCount,
    });
  } catch (error) {
    if (error instanceof TransactionStoreInputError || isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "요청 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 계좌 연결에 실패했습니다." } },
      { status: 500 },
    );
  }
}
