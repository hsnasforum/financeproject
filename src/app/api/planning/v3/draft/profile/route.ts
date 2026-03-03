import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { sanitizeRecordId } from "@/lib/planning/store/paths";
import { aggregateMonthlyCashflow } from "@/lib/planning/v3/service/aggregateMonthlyCashflow";
import {
  buildProfileDraftEstimateFromCashflow,
  ProfileDraftFromCashflowInputError,
} from "@/lib/planning/v3/service/draftFromCashflow";
import { listBatches, readBatchTransactions } from "@/lib/planning/v3/service/transactionStore";
import { listOverrides } from "@/lib/planning/v3/store/txnOverridesStore";

type DraftProfileBody = {
  source?: unknown;
  batchId?: unknown;
  includeTransfers?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = asString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function withWriteGuard(request: Request, body: DraftProfileBody): Response | null {
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

function resolveBatchId(body: DraftProfileBody): string | null {
  const batchId = asString(body?.batchId);
  if (!batchId) return null;
  return sanitizeRecordId(batchId);
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DraftProfileBody = null;
  try {
    body = (await request.json()) as DraftProfileBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const source = asString(body?.source || "csv").toLowerCase();
  if (source !== "csv") {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "지원하지 않는 source입니다." } },
      { status: 400 },
    );
  }

  const includeTransfers = asBoolean(body?.includeTransfers);

  let batchId: string | null = null;
  try {
    batchId = resolveBatchId(body);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "batchId 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    if (!batchId) {
      const listed = await listBatches({ limit: 1 });
      batchId = listed.items[0]?.id ?? null;
    }
    if (!batchId) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치 데이터가 없습니다." } },
        { status: 404 },
      );
    }

    const [loaded, overridesByTxnId] = await Promise.all([
      readBatchTransactions(batchId),
      listOverrides(),
    ]);
    if (!loaded) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const monthly = aggregateMonthlyCashflow(loaded.transactions, {
      includeTransfers,
      overridesByTxnId,
    });
    const built = buildProfileDraftEstimateFromCashflow(monthly, {
      recentMonths: 3,
      minMonths: 3,
      maxMonths: 6,
    });

    return NextResponse.json({
      ok: true,
      batchId: loaded.batch.id,
      patch: built.patch,
      evidence: built.evidence,
    });
  } catch (error) {
    if (error instanceof ProfileDraftFromCashflowInputError) {
      if (error.code === "INSUFFICIENT_DATA") {
        return NextResponse.json(
          { ok: false, error: { code: "INPUT", message: "데이터 부족: 최소 3개월 데이터가 필요합니다." } },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "초안 생성 입력이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Invalid record id") {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "batchId 형식이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "프로필 초안 생성에 실패했습니다." } },
      { status: 500 },
    );
  }
}
