import { loadCanonicalProfile } from "../../v2/loadCanonicalProfile";
import { type ProfileV2, PlanningV2ValidationError } from "../../v2/types";
import { validateProfileV2 } from "../../v2/validate";
import {
  type DraftPreflightChange,
  type DraftPreflightError,
  type DraftPreflightMessage,
  type DraftPreflightResult,
} from "../domain/preflightTypes";

type PreflightDraftPatchInput = {
  draftPatch: unknown;
  baseProfile?: ProfileV2;
  targetProfileId?: string;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function encodePointerToken(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function toJsonPointer(path: string[]): string {
  if (path.length < 1) return "/";
  return `/${path.map((segment) => encodePointerToken(segment)).join("/")}`;
}

function convertValidationPathToPointer(path: string): string {
  const trimmed = path.trim();
  const withoutProfilePrefix = trimmed.startsWith("profile.") ? trimmed.slice("profile.".length) : trimmed;
  if (!withoutProfilePrefix || withoutProfilePrefix === "profile") {
    return "/";
  }

  const dotted = withoutProfilePrefix.replace(/\[(\d+)\]/g, ".$1");
  const segments = dotted.split(".").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return toJsonPointer(segments);
}

function createDefaultBaseProfile(): ProfileV2 {
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

function applyPatchToExistingShape(base: unknown, patch: unknown): unknown {
  if (Array.isArray(base)) {
    if (Array.isArray(patch)) {
      return cloneJsonValue(patch);
    }
    return cloneJsonValue(base);
  }

  if (!isRecord(base)) {
    return patch !== undefined ? cloneJsonValue(patch) : cloneJsonValue(base);
  }

  const output: Record<string, unknown> = {};
  const baseKeys = Object.keys(base).sort((left, right) => left.localeCompare(right));
  for (const key of baseKeys) {
    output[key] = cloneJsonValue(base[key]);
  }

  if (!isRecord(patch)) return output;

  const patchKeys = Object.keys(patch).sort((left, right) => left.localeCompare(right));
  for (const key of patchKeys) {
    if (!(key in output)) continue;
    const current = output[key];
    const nextPatch = patch[key];

    if (isRecord(current) && isRecord(nextPatch)) {
      output[key] = applyPatchToExistingShape(current, nextPatch);
      continue;
    }

    if (Array.isArray(current)) {
      if (Array.isArray(nextPatch)) {
        output[key] = cloneJsonValue(nextPatch);
      }
      continue;
    }

    if (nextPatch !== undefined) {
      output[key] = cloneJsonValue(nextPatch);
    }
  }

  return output;
}

function collectIgnoredPatchPaths(patch: unknown, base: unknown, path: string[] = []): string[] {
  if (!isRecord(patch) || !isRecord(base)) return [];

  const rows: string[] = [];
  const patchKeys = Object.keys(patch).sort((left, right) => left.localeCompare(right));
  for (const key of patchKeys) {
    if (!(key in base)) {
      rows.push(toJsonPointer([...path, key]));
      continue;
    }
    rows.push(...collectIgnoredPatchPaths(patch[key], base[key], [...path, key]));
  }
  return rows;
}

function diffJson(before: unknown, after: unknown, path: string[] = [], out: DraftPreflightChange[] = []): DraftPreflightChange[] {
  if (Object.is(before, after)) return out;

  if (Array.isArray(before) && Array.isArray(after)) {
    const count = Math.max(before.length, after.length);
    for (let index = 0; index < count; index += 1) {
      diffJson(before[index], after[index], [...path, String(index)], out);
    }
    return out;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const sortedKeys = [...keys].sort((left, right) => left.localeCompare(right));
    for (const key of sortedKeys) {
      diffJson(before[key], after[key], [...path, key], out);
    }
    return out;
  }

  const pointer = toJsonPointer(path);
  if (before === undefined && after !== undefined) {
    out.push({ path: pointer, after: cloneJsonValue(after), kind: "add" });
    return out;
  }
  if (before !== undefined && after === undefined) {
    out.push({ path: pointer, before: cloneJsonValue(before), kind: "remove" });
    return out;
  }
  out.push({
    path: pointer,
    before: cloneJsonValue(before),
    after: cloneJsonValue(after),
    kind: "set",
  });
  return out;
}

function sortChanges(rows: DraftPreflightChange[]): DraftPreflightChange[] {
  return [...rows].sort((left, right) => {
    const pathDiff = left.path.localeCompare(right.path);
    if (pathDiff !== 0) return pathDiff;
    return left.kind.localeCompare(right.kind);
  });
}

function validateMergedProfile(profile: unknown): DraftPreflightError[] {
  try {
    validateProfileV2(profile);
    return [];
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return error.issues
        .map((issue) => ({
          path: convertValidationPathToPointer(issue.path),
          message: issue.message,
        }))
        .sort((left, right) => left.path.localeCompare(right.path) || left.message.localeCompare(right.message));
    }
    return [{ path: "/", message: "프로필 유효성 검증 중 오류가 발생했습니다." }];
  }
}

function toAfterOnlyChanges(rows: DraftPreflightChange[]): DraftPreflightChange[] {
  return rows.map((row) => ({
    path: row.path,
    ...(row.after !== undefined ? { after: row.after } : {}),
    kind: row.kind,
  }));
}

export function preflightDraftPatch(input: PreflightDraftPatchInput): DraftPreflightResult {
  const draftPatch = isRecord(input.draftPatch) ? input.draftPatch : {};
  const baseProfile = input.baseProfile ? loadCanonicalProfile(input.baseProfile).profile : createDefaultBaseProfile();
  const warnings: DraftPreflightMessage[] = [];

  if (!input.baseProfile) {
    warnings.push({
      code: "NO_BASE_PROFILE",
      message: "기준 프로필이 없어 기본 템플릿 기준으로 비교했습니다.",
    });
  }

  const ignoredPaths = collectIgnoredPatchPaths(draftPatch, baseProfile);
  if (ignoredPaths.length > 0) {
    warnings.push({
      code: "PATCH_PATH_IGNORED",
      message: `지원되지 않는 필드 ${ignoredPaths.length}개는 무시되었습니다.`,
    });
  }

  const mergedProfile = applyPatchToExistingShape(baseProfile, draftPatch) as JsonValue;
  const rawChanges = sortChanges(diffJson(baseProfile, mergedProfile));
  const changes = input.baseProfile ? rawChanges : toAfterOnlyChanges(rawChanges);
  const errors = validateMergedProfile(mergedProfile);

  return {
    ok: errors.length < 1,
    ...(input.targetProfileId ? { targetProfileId: input.targetProfileId } : {}),
    changes,
    warnings,
    errors,
    summary: {
      changedCount: changes.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
}

