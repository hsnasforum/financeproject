import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  AccountsStoreInputError,
  deleteAccount,
  updateAccount,
} from "@/lib/planning/v3/accounts/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchBody = {
  name?: unknown;
  kind?: unknown;
  note?: unknown;
  startingBalanceKrw?: unknown;
  csrf?: unknown;
} | null;

type DeleteBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withWriteGuard(request: Request, csrf: unknown): Response | null {
  try {
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

export async function PATCH(request: Request, context: RouteContext) {
  let body: PatchBody = null;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body?.csrf);
  if (guarded) return guarded;

  const { id } = await context.params;

  try {
    const updated = await updateAccount(id, {
      ...(body?.name !== undefined ? { name: body.name } : {}),
      ...(body?.kind !== undefined ? { kind: body.kind } : {}),
      ...(body?.note !== undefined ? { note: body.note } : {}),
      ...(body?.startingBalanceKrw !== undefined ? { startingBalanceKrw: body.startingBalanceKrw } : {}),
    });
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "계좌를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, account: updated });
  } catch (error) {
    if (error instanceof AccountsStoreInputError || isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "계좌 입력이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "계좌를 수정하지 못했습니다." } },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  let body: DeleteBody = null;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body?.csrf);
  if (guarded) return guarded;

  const { id } = await context.params;

  try {
    const deleted = await deleteAccount(id);
    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "계좌를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "계좌를 삭제하지 못했습니다." } },
      { status: 500 },
    );
  }
}
