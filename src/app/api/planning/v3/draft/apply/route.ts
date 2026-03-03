import { NextResponse } from "next/server";
import {
  assertLocalHost,
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { getProfile, updateProfile } from "@/lib/planning/server/store/profileStore";
import { sanitizeRecordId } from "@/lib/planning/store/paths";
import { aggregateMonthlyCashflow } from "@/lib/planning/v3/service/aggregateMonthlyCashflow";
import { buildDraftPatchFromCashflow } from "@/lib/planning/v3/service/buildDraftPatchFromCashflow";
import { readBatchTransactions } from "@/lib/planning/v3/service/transactionStore";
import { type ProfileV2 } from "@/lib/planning/v2/types";

type ApplyMode = "preview" | "apply";

type ApplyBody = {
  profileId?: unknown;
  batchId?: unknown;
  mode?: unknown;
  csrf?: unknown;
} | null;

type SummaryRow = {
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  monthlySurplusKrw: number;
};

type DiffRow = {
  field: "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses";
  label: string;
  beforeKrw: number;
  afterKrw: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function withWriteGuard(request: Request, body: ApplyBody): Response | null {
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

function parseMode(value: unknown): ApplyMode | null {
  const mode = asString(value);
  if (mode === "preview" || mode === "apply") return mode;
  return null;
}

function sanitizeIds(profileIdInput: unknown, batchIdInput: unknown): {
  profileId: string;
  batchId: string;
} | null {
  const profileIdText = asString(profileIdInput);
  const batchIdText = asString(batchIdInput);
  if (!profileIdText || !batchIdText) return null;

  try {
    return {
      profileId: sanitizeRecordId(profileIdText),
      batchId: sanitizeRecordId(batchIdText),
    };
  } catch {
    return null;
  }
}

function toSummary(profile: ProfileV2): SummaryRow {
  const monthlyIncomeNet = asNumber(profile.monthlyIncomeNet);
  const monthlyEssentialExpenses = asNumber(profile.monthlyEssentialExpenses);
  const monthlyDiscretionaryExpenses = asNumber(profile.monthlyDiscretionaryExpenses);
  return {
    monthlyIncomeNet,
    monthlyEssentialExpenses,
    monthlyDiscretionaryExpenses,
    monthlySurplusKrw: asNumber(monthlyIncomeNet - monthlyEssentialExpenses - monthlyDiscretionaryExpenses),
  };
}

function buildDiffRows(beforeProfile: ProfileV2, afterProfile: ProfileV2): DiffRow[] {
  const entries: DiffRow[] = [
    {
      field: "monthlyIncomeNet",
      label: "월소득",
      beforeKrw: asNumber(beforeProfile.monthlyIncomeNet),
      afterKrw: asNumber(afterProfile.monthlyIncomeNet),
    },
    {
      field: "monthlyEssentialExpenses",
      label: "필수지출",
      beforeKrw: asNumber(beforeProfile.monthlyEssentialExpenses),
      afterKrw: asNumber(afterProfile.monthlyEssentialExpenses),
    },
    {
      field: "monthlyDiscretionaryExpenses",
      label: "재량지출",
      beforeKrw: asNumber(beforeProfile.monthlyDiscretionaryExpenses),
      afterKrw: asNumber(afterProfile.monthlyDiscretionaryExpenses),
    },
  ];

  return entries.filter((row) => row.beforeKrw !== row.afterKrw);
}

function applyProfilePatch(base: ProfileV2, patch: {
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
}): ProfileV2 {
  return {
    ...base,
    monthlyIncomeNet: asNumber(patch.monthlyIncomeNet),
    monthlyEssentialExpenses: asNumber(patch.monthlyEssentialExpenses),
    monthlyDiscretionaryExpenses: asNumber(patch.monthlyDiscretionaryExpenses),
  };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ApplyBody = null;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const mode = parseMode(body?.mode);
  const ids = sanitizeIds(body?.profileId, body?.batchId);
  if (!mode || !ids) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  try {
    const [baseRecord, batchLoaded] = await Promise.all([
      getProfile(ids.profileId),
      readBatchTransactions(ids.batchId),
    ]);

    if (!baseRecord || !batchLoaded) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "프로필 또는 배치를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const monthly = aggregateMonthlyCashflow(batchLoaded.transactions);
    const built = buildDraftPatchFromCashflow(monthly);
    const mergedProfile = applyProfilePatch(baseRecord.profile, built.profilePatch);

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        currentProfileSummary: toSummary(baseRecord.profile),
        proposedSummary: toSummary(mergedProfile),
        diffRows: buildDiffRows(baseRecord.profile, mergedProfile),
        profilePatch: built.profilePatch,
        evidence: built.draftPatch.evidence,
      });
    }

    const updated = await updateProfile(ids.profileId, { profile: mergedProfile });
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_DATA", message: "프로필 저장에 실패했습니다." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      savedProfileId: updated.id,
      savedAt: updated.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "드래프트 적용 처리에 실패했습니다." } },
      { status: 500 },
    );
  }
}
