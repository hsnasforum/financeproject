import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { loadCanonicalProfile } from "@/lib/planning/v2/loadCanonicalProfile";
import { type ProfileV2 } from "@/lib/planning/v2/types";
import { applyDraftToProfile } from "@/lib/planning/v3/draft/service";
import { getLegacyDraft, getProfileDraftBridge } from "@/lib/planning/v3/draft/store";
import { type V3DraftRecord } from "@/lib/planning/v3/domain/draft";
import { type EvidenceRow } from "@/lib/planning/v3/domain/types";
import { getProfile } from "@/lib/planning/v3/profiles/store";

type PreviewBody = {
  draftPatch?: unknown;
  draftId?: unknown;
  baseProfile?: unknown;
  baseProfileId?: unknown;
  evidence?: unknown;
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInvalidIdError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid record id";
}

function withWriteGuard(request: Request, body: PreviewBody): Response | null {
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

function defaultCanonicalProfile(): ProfileV2 {
  return loadCanonicalProfile({
    monthlyIncomeNet: 0,
    monthlyEssentialExpenses: 0,
    monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0,
    investmentAssets: 0,
    debts: [],
    goals: [],
  }).profile;
}

function toInlineDraft(patch: Record<string, unknown>, draftId?: string): V3DraftRecord {
  return {
    id: draftId ?? "inline-draft",
    createdAt: new Date(0).toISOString(),
    source: { kind: "csv" },
    cashflow: [],
    draftPatch: patch as V3DraftRecord["draftPatch"],
    summary: {},
  };
}

function toPreviewDraft(input: {
  id: string;
  createdAt: string;
  source?: {
    kind?: "csv";
    filename?: string;
    rows?: number;
    months?: number;
  };
  meta?: {
    rowsParsed?: number;
  };
  monthlyCashflow: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount?: number;
  }>;
  draftPatch: Record<string, unknown>;
}): V3DraftRecord {
  return {
    id: input.id,
    createdAt: input.createdAt,
    source: {
      kind: "csv",
      ...(asString(input.source?.filename) ? { filename: asString(input.source?.filename) } : {}),
      ...(Number.isFinite(Number(input.meta?.rowsParsed)) ? { rows: Math.max(0, Math.trunc(Number(input.meta?.rowsParsed))) } : {}),
      ...(Number.isFinite(Number(input.source?.months))
        ? { months: Math.max(0, Math.trunc(Number(input.source?.months))) }
        : { months: input.monthlyCashflow.length }),
    },
    cashflow: input.monthlyCashflow,
    draftPatch: input.draftPatch,
    summary: {},
  };
}

function normalizeEvidenceRows(input: unknown): EvidenceRow[] {
  if (!Array.isArray(input)) return [];
  const rows: EvidenceRow[] = [];
  for (const row of input) {
    if (!isRecord(row)) continue;
    const key = asString(row.key);
    const title = asString(row.title);
    if (!key || !title) continue;
    const inputsRaw = isRecord(row.inputs) ? row.inputs : {};
    const inputs: Record<string, number | string> = {};
    for (const [entryKey, entryValue] of Object.entries(inputsRaw)) {
      if (typeof entryValue === "number" && Number.isFinite(entryValue)) {
        inputs[entryKey] = entryValue;
      } else if (typeof entryValue === "string") {
        inputs[entryKey] = entryValue.slice(0, 120);
      }
    }

    rows.push({
      key,
      title,
      ...(asString(row.formula) ? { formula: asString(row.formula) } : {}),
      inputs,
      ...(asString(row.assumption) ? { assumption: asString(row.assumption) } : {}),
      ...(asString(row.note) ? { note: asString(row.note) } : {}),
    });
  }
  return rows.slice(0, 20);
}

export async function POST(request: Request) {
  let body: PreviewBody = null;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  const draftId = asString(body?.draftId);
  const hasInlinePatch = isRecord(body?.draftPatch);
  if (!hasInlinePatch && !draftId) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "draftPatch 또는 draftId가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    let draft: V3DraftRecord | null = null;
    if (hasInlinePatch) {
      draft = toInlineDraft(body?.draftPatch as Record<string, unknown>, draftId || undefined);
    } else {
      draft = await getProfileDraftBridge(draftId);
      if (!draft) {
        const legacyDraft = await getLegacyDraft(draftId);
        if (legacyDraft) {
          draft = toPreviewDraft(legacyDraft);
        }
      }
      if (!draft) {
        return NextResponse.json(
          { ok: false, error: { code: "NO_DATA", message: "초안을 찾을 수 없습니다." } },
          { status: 404 },
        );
      }
    }

    let baseProfile: ProfileV2;
    if (body?.baseProfile !== undefined) {
      baseProfile = loadCanonicalProfile(body.baseProfile).profile;
    } else {
      const baseProfileId = asString(body?.baseProfileId);
      if (baseProfileId) {
        const baseRecord = await getProfile(baseProfileId);
        if (!baseRecord) {
          return NextResponse.json(
            { ok: false, error: { code: "NO_DATA", message: "기준 프로필을 찾을 수 없습니다." } },
            { status: 404 },
          );
        }
        baseProfile = baseRecord.profile;
      } else {
        baseProfile = defaultCanonicalProfile();
      }
    }

    const applied = applyDraftToProfile({
      baseProfile,
      draft,
    });

    const evidence = normalizeEvidenceRows(body?.evidence);

    return NextResponse.json({
      ok: true,
      mergedProfile: applied.merged,
      diffSummary: {
        changedKeys: applied.summary.changedFields,
        notes: applied.summary.notes,
      },
      ...(evidence.length > 0 ? { evidence } : {}),
    });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: "INPUT", message: "잘못된 요청입니다." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "드래프트 미리보기에 실패했습니다." } },
      { status: 500 },
    );
  }
}
