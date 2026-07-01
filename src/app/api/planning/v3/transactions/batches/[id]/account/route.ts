import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  TransactionStoreInputError,
  updateCurrentUserBatchAccountBinding,
} from "@/lib/planning/v3/service/batchAccountRepository";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

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

export async function POST(request: Request, context: RouteContext) {
  let body: Body = null;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const accountId = asString(body?.accountId);
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "거래 계좌를 선택해 주세요." }, meta: userMeta },
      { status: 400 },
    );
  }

  const { id } = await context.params;

  try {
    const result = await updateCurrentUserBatchAccountBinding(id, accountId);
    if (result.status === "synthetic-stored-only") {
      // Read surfaces can synthesize batch detail from stored rows only,
      // but account binding still writes through the legacy batch owner.
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "저장 메타가 없는 배치는 아직 계좌 연결을 지원하지 않습니다." }, meta: userMeta },
        { status: 400 },
      );
    }
    if (result.status === "stored-not-found") {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." }, meta: userMeta },
        { status: 404 },
      );
    }
    if (result.status === "migration-conflict") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "MIGRATION_CONFLICT",
            message: "같은 ID의 기존 거래 데이터가 남아 있어 사용자 요청으로 계좌 연결을 바꿀 수 없습니다.",
          },
          meta: userMeta,
        },
        { status: 409 },
      );
    }
    if (result.status === "stored-meta-only") {
      return NextResponse.json(
        {
          ok: true,
          batch: result.batch,
          updatedTransactionCount: result.updatedTransactionCount,
          meta: userMeta,
        },
      );
    }
  } catch (error) {
    if (error instanceof TransactionStoreInputError || isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "요청 형식이 올바르지 않습니다." }, meta: userMeta },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 계좌 연결에 실패했습니다." }, meta: userMeta },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message: "배치 계좌 연결 상태를 확인하지 못했습니다." }, meta: userMeta },
    { status: 500 },
  );
}
