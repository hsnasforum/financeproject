import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { deleteDraft, getDraft } from "@/lib/planning/v3/drafts/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DeleteBody = {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withLocalReadGuard(request: Request): Response | null {
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

function withLocalWriteGuard(request: Request, body: DeleteBody): Response | null {
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

function errorResponseByCode(code: string): Response {
  if (code === "NO_DATA") {
    return NextResponse.json(
      { ok: false, error: { code, message: "초안을 찾을 수 없습니다." } },
      { status: 404 },
    );
  }
  if (code === "INPUT") {
    return NextResponse.json(
      { ok: false, error: { code, message: "잘못된 요청입니다." } },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message: "요청 처리에 실패했습니다." } },
    { status: 500 },
  );
}

function isInvalidIdError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid record id";
}

export async function GET(request: Request, context: RouteContext) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  try {
    const draft = await getDraft(id);
    if (!draft) return errorResponseByCode("NO_DATA");
    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    if (isInvalidIdError(error)) return errorResponseByCode("INPUT");
    return errorResponseByCode("INTERNAL");
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

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  const { id } = await context.params;
  try {
    const deleted = await deleteDraft(id);
    if (!deleted) return errorResponseByCode("NO_DATA");
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    if (isInvalidIdError(error)) return errorResponseByCode("INPUT");
    return errorResponseByCode("INTERNAL");
  }
}

