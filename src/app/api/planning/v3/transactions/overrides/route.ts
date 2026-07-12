import {
  NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
  } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { planningStorageErrorResponse } from "@/lib/planning/api/storageErrorResponse";
import {
  TxnOverridesStoreInputError,
  deleteCurrentUserTransactionOverride,
  listCurrentUserTransactionOverrides,
  upsertCurrentUserTransactionOverride,
} from "@/lib/planning/v3/service/transactionOverridesRepository";

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
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    try {
      const result = await listCurrentUserTransactionOverrides(
        new URL(request.url).searchParams.get("batchId"),
      );
      return NextResponse.json({
        ok: true,
        items: result.items,
        batchId: result.batchId,
        scope: result.scope,
        meta: userMeta,
      });
    } catch (error) {
      const storageError = planningStorageErrorResponse(error, userMeta);
      if (storageError) return storageError;
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "거래 오버라이드 목록 조회에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
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
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "오버라이드 입력이 필요합니다." }, meta: userMeta },
        { status: 400 },
      );
    }

    try {
      const result = await upsertCurrentUserTransactionOverride({
        batchId: body.batchId,
        txnId: body.txnId,
        categoryId: body.categoryId,
        note: body.note,
        kind: body.kind,
        category: body.category,
      });
      return NextResponse.json({ ok: true, override: result.override, scope: result.scope, meta: userMeta });
    } catch (error) {
      const storageError = planningStorageErrorResponse(error, userMeta);
      if (storageError) return storageError;
      if (error instanceof TxnOverridesStoreInputError) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "INPUT", message: "오버라이드 입력이 올바르지 않습니다." },
            details: error.details,
            meta: userMeta,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "오버라이드 저장에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
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
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    try {
      const result = await deleteCurrentUserTransactionOverride({
        batchId: query.get("batchId") ?? body?.batchId,
        txnId: query.get("txnId") ?? body?.txnId,
      });
      return NextResponse.json({ ok: true, deleted: result.deleted, scope: result.scope, meta: userMeta });
    } catch (error) {
      const storageError = planningStorageErrorResponse(error, userMeta);
      if (storageError) return storageError;
      if (error instanceof TxnOverridesStoreInputError) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "INPUT", message: "오버라이드 삭제 입력이 올바르지 않습니다." },
            details: error.details,
            meta: userMeta,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "오버라이드 삭제에 실패했습니다." }, meta: userMeta },
        { status: 500 },
      );
    }
  });
}
