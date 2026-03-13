import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  TxnOverridesStoreInputError,
  deleteOverride,
  getOverrides,
  upsertOverride,
} from "@/lib/planning/v3/store/txnOverridesStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PostBody = {
  txnId?: unknown;
  kind?: unknown;
  categoryId?: unknown;
  note?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withReadGuard(request: Request): Response | null {
  try {
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

function mapKind(kindRaw: unknown): "income" | "expense" | "transfer" | "auto" | "" {
  const kind = asString(kindRaw).toLowerCase();
  if (!kind) return "";
  if (kind === "auto") return "auto";
  if (kind === "income" || kind === "force_income") return "income";
  if (kind === "expense" || kind === "force_expense") return "expense";
  if (kind === "transfer" || kind === "force_transfer") return "transfer";
  return "";
}

export async function GET(request: Request, context: RouteContext) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;

  try {
    const items = await getOverrides(id);
    return NextResponse.json({ ok: true, data: items });
  } catch (error) {
    if (error instanceof TxnOverridesStoreInputError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INPUT", message: "배치 식별자가 올바르지 않습니다." },
          details: error.details,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "거래 오버라이드 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  let body: PostBody = null;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body?.csrf);
  if (guarded) return guarded;

  if (!body) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "오버라이드 입력이 필요합니다." } },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const txnId = asString(body.txnId);
  const mappedKind = mapKind(body.kind);
  const categoryId = asString(body.categoryId);
  const note = asString(body.note);

  if (!txnId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "txnId가 필요합니다." } },
      { status: 400 },
    );
  }

  if (asString(body.kind) && !mappedKind) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "kind 값이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    if (mappedKind === "auto" && !categoryId) {
      await deleteOverride({ batchId: id, txnId });
      return NextResponse.json({ ok: true, data: { deleted: true } });
    }

    const override = await upsertOverride({
      batchId: id,
      txnId,
      ...(mappedKind && mappedKind !== "auto" ? { kind: mappedKind } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(note ? { note } : {}),
    });
    return NextResponse.json({ ok: true, data: override });
  } catch (error) {
    if (error instanceof TxnOverridesStoreInputError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INPUT", message: "오버라이드 입력이 올바르지 않습니다." },
          details: error.details,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "오버라이드 저장에 실패했습니다." } },
      { status: 500 },
    );
  }
}
