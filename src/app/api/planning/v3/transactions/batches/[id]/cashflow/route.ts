import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { aggregateMonthlyCashflow } from "@/lib/planning/v3/service/aggregateMonthlyCashflow";
import { applyAccountMappingOverrides } from "@/lib/planning/v3/service/applyAccountMappingOverrides";
import {
  buildDraftPatchFromCashflow,
  type BuildDraftPatchFromCashflowOptions,
} from "@/lib/planning/v3/service/buildDraftPatchFromCashflow";
import { detectTransfers } from "@/lib/planning/v3/service/detectTransfers";
import { readBatchTransactions } from "@/lib/planning/v3/service/transactionStore";
import { getAccountMappingOverrides } from "@/lib/planning/v3/store/accountMappingOverridesStore";
import { getTransferOverrides } from "@/lib/planning/v3/store/txnTransferOverridesStore";
import { listOverrides } from "@/lib/planning/v3/store/txnOverridesStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRatio(value: string | null): number | null {
  if (value === null || value.trim().length < 1) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function asBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return null;
}

function parseSplitOptions(request: Request): BuildDraftPatchFromCashflowOptions | null {
  const params = new URL(request.url).searchParams;
  const splitModeRaw = asString(params.get("splitMode"));
  const splitMode = splitModeRaw || "byCategory";
  if (splitMode !== "byCategory" && splitMode !== "byRatio" && splitMode !== "noSplit") {
    return null;
  }

  const fixedRatio = asRatio(params.get("fixedRatio"));
  const variableRatio = asRatio(params.get("variableRatio"));

  return {
    splitMode,
    ...(fixedRatio !== null ? { fixedRatio } : {}),
    ...(variableRatio !== null ? { variableRatio } : {}),
  };
}

function parseIncludeTransfersOption(request: Request): boolean {
  const params = new URL(request.url).searchParams;
  const parsed = asBoolean(params.get("includeTransfers"));
  if (parsed === null) return false;
  return parsed;
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

function isInvalidIdError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid record id";
}

export async function GET(request: Request, context: RouteContext) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const { id } = await context.params;
  const splitOptions = parseSplitOptions(request);
  const includeTransfers = parseIncludeTransfersOption(request);
  if (!splitOptions) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "초안 생성 옵션이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    const loaded = await readBatchTransactions(id);
    if (!loaded) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    if (!asString(loaded.batch.accountId)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "배치 계좌를 먼저 선택해 주세요." } },
        { status: 400 },
      );
    }

    const [overridesByTxnId, accountOverrides, transferOverrides] = await Promise.all([
      listOverrides(),
      getAccountMappingOverrides(id).catch(() => ({})),
      getTransferOverrides(id).catch(() => ({})),
    ]);
    const mapped = applyAccountMappingOverrides(loaded.transactions, accountOverrides);
    const transferDetected = detectTransfers({
      batchId: id,
      transactions: mapped,
      overridesByTxnId: transferOverrides,
    });

    const monthly = aggregateMonthlyCashflow(transferDetected.transactions, {
      includeTransfers,
      overridesByTxnId,
    });
    const built = buildDraftPatchFromCashflow(monthly, splitOptions);

    return NextResponse.json({
      ok: true,
      monthly,
      draftPatch: built.draftPatch,
      profilePatch: built.profilePatch,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("split")) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "초안 생성 옵션이 올바르지 않습니다." } },
        { status: 400 },
      );
    }
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "캐시플로우 집계에 실패했습니다." } },
      { status: 500 },
    );
  }
}
