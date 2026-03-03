import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { listDrafts, saveDraft } from "@/lib/planning/v3/drafts/store";
import { type PlanningV3Draft } from "@/lib/planning/v3/drafts/types";

type DraftCreateBody = {
  cashflow?: unknown;
  draftPatch?: unknown;
  meta?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function withLocalWriteGuard(request: Request, body: DraftCreateBody): Response | null {
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

function isCreateInput(body: DraftCreateBody): body is Required<Pick<NonNullable<DraftCreateBody>, "cashflow" | "draftPatch" | "meta">> & {
  csrf?: unknown;
} {
  if (!isRecord(body)) return false;
  return Array.isArray(body.cashflow) && isRecord(body.meta) && isRecord(body.draftPatch);
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const drafts = await listDrafts();
    return NextResponse.json({
      ok: true,
      drafts,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DraftCreateBody = null;
  try {
    body = (await request.json()) as DraftCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  if (!isCreateInput(body)) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    const draft = await saveDraft({
      source: "csv",
      cashflow: body.cashflow,
      draftPatch: body.draftPatch,
      meta: body.meta,
    } as Omit<PlanningV3Draft, "id" | "createdAt">);
    return NextResponse.json({
      ok: true,
      draft,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}

