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
  listAccounts,
  upsertAccount,
} from "@/lib/planning/v3/store/accountsStore";

type CreateBody = {
  accountId?: unknown;
  name?: unknown;
  kind?: unknown;
  note?: unknown;
  startingBalanceKrw?: unknown;
  createdAt?: unknown;
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

function withWriteGuard(request: Request, body: CreateBody): Response | null {
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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  try {
    const items = await listAccounts();
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "계좌 목록을 불러오지 못했습니다." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CreateBody = null;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  try {
    const account = await upsertAccount({
      ...(body?.accountId !== undefined ? { accountId: body.accountId } : {}),
      name: body?.name,
      ...(body?.kind !== undefined ? { kind: body.kind } : {}),
      ...(body?.note !== undefined ? { note: body.note } : {}),
      ...(body?.createdAt !== undefined ? { createdAt: body.createdAt } : {}),
      ...(body?.startingBalanceKrw !== undefined ? { startingBalanceKrw: body.startingBalanceKrw } : {}),
    });
    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) {
    if (error instanceof AccountsStoreInputError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INPUT", message: "계좌 입력이 올바르지 않습니다." },
          details: error.details,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "계좌를 생성하지 못했습니다." } },
      { status: 500 },
    );
  }
}
