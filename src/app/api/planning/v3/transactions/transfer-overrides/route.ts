import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import {
  TxnTransferOverridesStoreInputError,
  upsertTransferOverride,
} from "@/lib/planning/v3/store/txnTransferOverridesStore";

type PatchBody = {
  batchId?: unknown;
  txnId?: unknown;
  forceTransfer?: unknown;
  forceNonTransfer?: unknown;
  note?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    const override = await upsertTransferOverride({
      batchId: body.batchId,
      txnId: body.txnId,
      forceTransfer: body.forceTransfer,
      forceNonTransfer: body.forceNonTransfer,
      note: body.note,
    });
    return NextResponse.json({ ok: true, override });
  } catch (error) {
    if (error instanceof TxnTransferOverridesStoreInputError) {
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
