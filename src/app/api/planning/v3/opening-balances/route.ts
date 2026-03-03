import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { getOpeningBalances, upsertOpeningBalance } from "@/lib/planning/v3/store/openingBalancesStore";

type PatchBody = {
  accountId?: unknown;
  asOfDate?: unknown;
  amountKrw?: unknown;
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

function isSafeDate(value: string): boolean {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return false;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  try {
    const data = await getOpeningBalances();
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초기잔액 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
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

  const accountId = asString(body?.accountId);
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "accountId를 입력해 주세요." } },
      { status: 400 },
    );
  }
  const asOfDate = asString(body?.asOfDate);
  if (!isSafeDate(asOfDate)) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "기준일 형식이 올바르지 않습니다. (YYYY-MM-DD)" } },
      { status: 400 },
    );
  }
  const amountKrw = Number(body?.amountKrw);
  if (!Number.isFinite(amountKrw) || !Number.isInteger(amountKrw)) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "금액은 정수(원 단위)여야 합니다." } },
      { status: 400 },
    );
  }

  try {
    const openingBalance = await upsertOpeningBalance(accountId, asOfDate, amountKrw);
    return NextResponse.json({ ok: true, openingBalance });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "초기잔액 저장에 실패했습니다." } },
      { status: 400 },
    );
  }
}
