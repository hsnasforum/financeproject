import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { createDraft, listDrafts } from "@/lib/planning/v3/store/draftStore";

type DraftCreateBody = {
  source?: unknown;
  cashflow?: unknown;
  draftPatch?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function withWriteGuard(request: Request, body: DraftCreateBody): Response | null {
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

function isCreateInput(body: DraftCreateBody): body is {
  source?: unknown;
  cashflow: unknown[];
  draftPatch: Record<string, unknown>;
  csrf?: unknown;
} {
  if (!isRecord(body)) return false;
  return Array.isArray(body.cashflow) && isRecord(body.draftPatch);
}

function isInvalidInputError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes("must be")
    || error.message.startsWith("invalid")
    || error.message === "Invalid record id"
  );
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  try {
    const drafts = await listDrafts();
    return NextResponse.json({
      ok: true,
      drafts: drafts.map((draft) => ({
        id: draft.id,
        createdAt: draft.createdAt,
        source: draft.source,
        summary: draft.summary,
      })),
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

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  if (!isCreateInput(body)) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    const draft = await createDraft({
      source: body.source,
      cashflow: body.cashflow,
      draftPatch: body.draftPatch,
    });
    return NextResponse.json({ ok: true, id: draft.id }, { status: 201 });
  } catch (error) {
    if (isInvalidInputError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "요청 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "초안 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
