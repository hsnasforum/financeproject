import { createProfile, getProfile } from "../../store/profileStore";
import { sanitizeRecordId } from "../../store/paths";
import { roundKrw } from "../../calc";
import { loadCanonicalProfile } from "../../v2/loadCanonicalProfile";
import { type ProfileV2, PlanningV2ValidationError, type ValidationIssueV2 } from "../../v2/types";
import { validateProfileV2 } from "../../v2/validate";
import { getProfileDraft } from "../store/draftStore";

export type ApplyDraftPatchToProfileArgs = {
  draftId: string;
  baseProfileId?: string;
};

export type ApplyDraftPatchToProfileResult = {
  createdProfileId: string;
};

export type ApplyDraftPatchToProfileErrorCode = "NO_DATA" | "INPUT" | "INTERNAL";

export class ApplyDraftPatchToProfileError extends Error {
  readonly code: ApplyDraftPatchToProfileErrorCode;
  readonly status: number;
  readonly details?: ValidationIssueV2[];

  constructor(
    code: ApplyDraftPatchToProfileErrorCode,
    message: string,
    options?: { details?: ValidationIssueV2[]; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ApplyDraftPatchToProfileError";
    this.code = code;
    this.status = code === "INPUT" ? 400 : code === "NO_DATA" ? 404 : 500;
    this.details = options?.details;
  }
}

type MonthlyField = "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses";

type MonthlyPatch = Partial<Record<MonthlyField, number>>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toRecordId(value: unknown, label: "draftId" | "profileId"): string {
  const text = asString(value);
  try {
    return sanitizeRecordId(text);
  } catch {
    throw new ApplyDraftPatchToProfileError("INPUT", `${label} 형식이 올바르지 않습니다.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRoundedNumber(value: unknown, field: MonthlyField): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim().length < 1) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApplyDraftPatchToProfileError("INPUT", `${field} 값이 올바른 숫자가 아닙니다.`);
  }
  return roundKrw(parsed);
}

function normalizeMonthlyPatch(draftPatch: unknown): MonthlyPatch {
  if (!isRecord(draftPatch)) return {};
  const monthlyIncomeNet = toRoundedNumber(draftPatch.monthlyIncomeNet, "monthlyIncomeNet");
  const monthlyEssentialExpenses = toRoundedNumber(
    draftPatch.monthlyEssentialExpenses,
    "monthlyEssentialExpenses",
  );
  const monthlyDiscretionaryExpenses = toRoundedNumber(
    draftPatch.monthlyDiscretionaryExpenses,
    "monthlyDiscretionaryExpenses",
  );
  return {
    ...(monthlyIncomeNet !== undefined ? { monthlyIncomeNet } : {}),
    ...(monthlyEssentialExpenses !== undefined ? { monthlyEssentialExpenses } : {}),
    ...(monthlyDiscretionaryExpenses !== undefined ? { monthlyDiscretionaryExpenses } : {}),
  };
}

function createTemplateProfile(monthlyPatch: MonthlyPatch): ProfileV2 {
  if (monthlyPatch.monthlyIncomeNet === undefined) {
    throw new ApplyDraftPatchToProfileError("INPUT", "기준 프로필 없이 생성하려면 monthlyIncomeNet 값이 필요합니다.");
  }
  return loadCanonicalProfile({
    monthlyIncomeNet: monthlyPatch.monthlyIncomeNet,
    monthlyEssentialExpenses: monthlyPatch.monthlyEssentialExpenses ?? 0,
    monthlyDiscretionaryExpenses: monthlyPatch.monthlyDiscretionaryExpenses ?? 0,
    liquidAssets: 0,
    investmentAssets: 0,
    debts: [],
    goals: [],
  }).profile;
}

function applyMonthlyPatch(baseProfile: ProfileV2, monthlyPatch: MonthlyPatch): ProfileV2 {
  return {
    ...baseProfile,
    ...(monthlyPatch.monthlyIncomeNet !== undefined ? { monthlyIncomeNet: monthlyPatch.monthlyIncomeNet } : {}),
    ...(monthlyPatch.monthlyEssentialExpenses !== undefined
      ? { monthlyEssentialExpenses: monthlyPatch.monthlyEssentialExpenses }
      : {}),
    ...(monthlyPatch.monthlyDiscretionaryExpenses !== undefined
      ? { monthlyDiscretionaryExpenses: monthlyPatch.monthlyDiscretionaryExpenses }
      : {}),
  };
}

function ensureValidProfile(profile: ProfileV2): ProfileV2 {
  try {
    return validateProfileV2(profile);
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      throw new ApplyDraftPatchToProfileError("INPUT", "프로필 유효성 검증에 실패했습니다.", {
        details: error.issues,
        cause: error,
      });
    }
    throw new ApplyDraftPatchToProfileError("INTERNAL", "프로필 검증 중 오류가 발생했습니다.", { cause: error });
  }
}

function buildCreatedProfileName(draftId: string): string {
  const suffix = draftId.slice(0, 12);
  return `Draft 적용본 ${suffix}`;
}

export async function applyDraftPatchToProfile(
  args: ApplyDraftPatchToProfileArgs,
): Promise<ApplyDraftPatchToProfileResult> {
  const draftId = toRecordId(args.draftId, "draftId");
  const draft = await getProfileDraft(draftId);
  if (!draft) {
    throw new ApplyDraftPatchToProfileError("NO_DATA", "초안을 찾을 수 없습니다.");
  }

  const monthlyPatch = normalizeMonthlyPatch(draft.draftPatch);
  const baseProfileId = asString(args.baseProfileId);
  let baseProfile: ProfileV2;
  if (baseProfileId) {
    const safeBaseProfileId = toRecordId(baseProfileId, "profileId");
    const baseRecord = await getProfile(safeBaseProfileId);
    if (!baseRecord) {
      throw new ApplyDraftPatchToProfileError("NO_DATA", "기준 프로필을 찾을 수 없습니다.");
    }
    baseProfile = baseRecord.profile;
  } else {
    baseProfile = createTemplateProfile(monthlyPatch);
  }

  const merged = applyMonthlyPatch(baseProfile, monthlyPatch);
  const validProfile = ensureValidProfile(merged);
  const created = await createProfile({
    name: buildCreatedProfileName(draft.id),
    profile: validProfile,
  });
  return { createdProfileId: created.id };
}
