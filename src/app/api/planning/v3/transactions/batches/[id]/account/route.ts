import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  TransactionStoreInputError,
  runSameIdCoexistenceStoredThenLegacyRouteLocalSequence,
  toSameIdCoexistenceUserFacingInternalFailure,
  updateBatchAccount,
} from "@/lib/planning/v3/service/transactionStore";
import { updateStoredBatchAccountBinding } from "@/lib/planning/v3/store/batchesStore";
import {
  buildSameIdCoexistenceVerifiedSuccessResponseShell,
  getStoredBatchAccountCommandSurfaceState,
  runSameIdCoexistencePostWriteSuccessSplitWorker,
} from "@/lib/planning/v3/transactions/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Body = {
  accountId?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function withWriteGuard(request: Request, body: Body): Response | null {
  try {
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

function isInvalidIdError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid record id";
}

function toStoredMetaOnlyResponseBatch(input: {
  batchId: string;
  createdAt: string;
  rowCount: number;
  accountId: string;
}) {
  return {
    id: input.batchId,
    createdAt: input.createdAt,
    kind: "csv" as const,
    total: input.rowCount,
    ok: input.rowCount,
    failed: 0,
    accountId: input.accountId,
    accountHint: input.accountId,
  };
}

export async function POST(request: Request, context: RouteContext) {
  let body: Body = null;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const accountId = asString(body?.accountId);
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "거래 계좌를 선택해 주세요." } },
      { status: 400 },
    );
  }

  const { id } = await context.params;

  try {
    const commandSurface = await getStoredBatchAccountCommandSurfaceState(id);
    if (commandSurface === "synthetic-stored-only") {
      // Read surfaces can synthesize batch detail from stored rows only,
      // but account binding still writes through the legacy batch owner.
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "저장 메타가 없는 배치는 아직 계좌 연결을 지원하지 않습니다." } },
        { status: 400 },
      );
    }
    if (commandSurface === "stored-meta-only") {
      const updatedMeta = await updateStoredBatchAccountBinding(id, accountId);
      if (!updatedMeta) {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          ok: true,
          batch: toStoredMetaOnlyResponseBatch({
            batchId: updatedMeta.id,
            createdAt: updatedMeta.createdAt,
            rowCount: updatedMeta.rowCount,
            accountId: updatedMeta.accounts?.[0]?.id ?? accountId,
          }),
          updatedTransactionCount: 0,
        },
      );
    }
    if (commandSurface === "stored-meta-legacy-coexistence") {
      const sequencing = await runSameIdCoexistenceStoredThenLegacyRouteLocalSequence({
        batchId: id,
        targetAccountId: accountId,
      });
      if (sequencing.status === "secondary-failure") {
        const failure = toSameIdCoexistenceUserFacingInternalFailure(sequencing);
        return NextResponse.json(
          { ok: false, error: { code: failure.code, message: failure.message } },
          { status: 500 },
        );
      }

      const split = await runSameIdCoexistencePostWriteSuccessSplitWorker(sequencing);
      if (split.status === "visible-verification-failed") {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: split.userFacingFailure.code,
              message: split.userFacingFailure.message,
            },
          },
          { status: 500 },
        );
      }

      const responseShell = await buildSameIdCoexistenceVerifiedSuccessResponseShell(split);
      return NextResponse.json({
        ok: true,
        ...responseShell,
      });
    }
    const updated = await updateBatchAccount(id, accountId);
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      batch: updated.batch,
      updatedTransactionCount: updated.updatedTransactionCount,
    });
  } catch (error) {
    if (error instanceof TransactionStoreInputError || isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "요청 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 계좌 연결에 실패했습니다." } },
      { status: 500 },
    );
  }
}
