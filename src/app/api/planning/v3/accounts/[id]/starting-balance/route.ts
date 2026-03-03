import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  AccountsStoreInputError,
  getAccount,
  setAccountStartingBalance,
} from "@/lib/planning/v3/store/accountsStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchBody = {
  startingBalanceKrw?: unknown;
  csrf?: unknown;
} | null;

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

function withWriteGuard(request: Request, csrf: unknown): Response | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(csrf) }, { allowWhenCookieMissing: true });
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

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;

  try {
    const account = await getAccount(id);
    if (!account) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "계좌를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const hasStartingBalance = Number.isInteger(account.startingBalanceKrw);
    return NextResponse.json({
      ok: true,
      accountId: account.id,
      hasStartingBalance,
      ...(hasStartingBalance ? { startingBalanceKrw: Number(account.startingBalanceKrw) } : {}),
    });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초기잔액 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: PatchBody = null;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body?.csrf);
  if (guarded) return guarded;

  if (!body || !Object.prototype.hasOwnProperty.call(body, "startingBalanceKrw")) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "초기잔액 값을 입력해 주세요." } },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  try {
    const updated = await setAccountStartingBalance(id, body.startingBalanceKrw);
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "계좌를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const hasStartingBalance = Number.isInteger(updated.startingBalanceKrw);
    return NextResponse.json({
      ok: true,
      account: updated,
      hasStartingBalance,
      ...(hasStartingBalance ? { startingBalanceKrw: Number(updated.startingBalanceKrw) } : {}),
    });
  } catch (error) {
    if (error instanceof AccountsStoreInputError || isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "초기잔액 입력이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초기잔액 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
