import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  TxnOverridesStoreInputError,
  deleteOverride,
  getOverrides,
  listOverrides,
  upsertOverride,
} from "@/lib/planning/v3/store/txnOverridesStore";

type PatchBody = {
  batchId?: unknown;
  txnId?: unknown;
  categoryId?: unknown;
  note?: unknown;
  kind?: unknown;
  category?: unknown;
  csrf?: unknown;
} | null;

type DeleteBody = {
  batchId?: unknown;
  txnId?: unknown;
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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  try {
    const batchId = asString(new URL(request.url).searchParams.get("batchId"));
    if (batchId) {
      const items = await getOverrides(batchId);
      return NextResponse.json({ ok: true, items, batchId });
    }

    const items = await listOverrides();
    return NextResponse.json({ ok: true, items, batchId: null });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "거래 오버라이드 목록 조회에 실패했습니다." } },
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

  if (!body) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "오버라이드 입력이 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const batchId = asString(body.batchId);
    const hasCategoryId = asString(body.categoryId).length > 0;
    const override = batchId && hasCategoryId
      ? await upsertOverride({
          batchId,
          txnId: body.txnId,
          categoryId: body.categoryId,
          ...(body.note !== undefined ? { note: body.note } : {}),
        })
      : await upsertOverride(body.txnId, {
          ...(body.kind !== undefined ? { kind: body.kind } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        });
    return NextResponse.json({ ok: true, override });
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

export async function DELETE(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const query = new URL(request.url).searchParams;
  let body: DeleteBody = null;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body?.csrf ?? query.get("csrf"));
  if (guarded) return guarded;

  try {
    const batchId = asString(query.get("batchId") ?? body?.batchId);
    const txnId = asString(query.get("txnId") ?? body?.txnId);
    if (batchId && txnId) {
      await deleteOverride({ batchId, txnId });
    } else {
      await deleteOverride(txnId);
    }
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    if (error instanceof TxnOverridesStoreInputError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INPUT", message: "오버라이드 삭제 입력이 올바르지 않습니다." },
          details: error.details,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "오버라이드 삭제에 실패했습니다." } },
      { status: 500 },
    );
  }
}
