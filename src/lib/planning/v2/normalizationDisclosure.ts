import { type ProfileV2 } from "./types";

export type NormalizationFixApplied = {
  path: string;
  from?: unknown;
  to?: unknown;
  message: string;
};

export type ProfileNormalizationDisclosure = {
  defaultsApplied: string[];
  fixesApplied: NormalizationFixApplied[];
};

export type DisclosureFixInput = {
  path: string;
  from?: unknown;
  to?: unknown;
  message?: string;
};

type NormalizeResultLike = {
  warnings: string[];
  fixes: Array<{ field: string; from: unknown; to: unknown }>;
};

function asCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function toPath(field: string): string {
  if (!field) return "profile";
  if (field.startsWith("/")) return field;
  return field
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\.+/, "")
    .split(".")
    .filter((token) => token.length > 0)
    .reduce((path, token) => `${path}/${token}`, "");
}

function warningToFixMessage(code: string): string {
  if (code.includes("APR")) return "APR 입력값을 퍼센트 단위로 보정했습니다.";
  if (code.includes("DEFAULTED")) return "누락/비정상 값을 기본값으로 보정했습니다.";
  if (code.includes("DUPLICATE")) return "중복 값을 정리했습니다.";
  return "입력값을 안전한 범위로 보정했습니다.";
}

export function buildProfileNormalizationDisclosure(
  normalized: NormalizeResultLike,
  canonicalProfile: ProfileV2,
  extraFixes?: DisclosureFixInput[],
): ProfileNormalizationDisclosure {
  const defaultSet = new Set<string>();
  const fixes: NormalizationFixApplied[] = [];

  const defaultsFromProfile = Array.isArray(canonicalProfile.defaultsApplied?.items)
    ? canonicalProfile.defaultsApplied.items
    : [];
  defaultsFromProfile.forEach((item) => {
    const code = asCode(item);
    if (code) defaultSet.add(code);
  });

  normalized.warnings.forEach((warning) => {
    const code = asCode(warning);
    if (!code) return;
    if (code.includes("DEFAULTED")) {
      defaultSet.add(code);
    }
  });

  normalized.fixes.forEach((fix) => {
    const path = toPath(fix.field);
    const warningMatch = normalized.warnings.find((warning) => warning.includes(fix.field) || warning.includes(fix.field.replace(/\[\d+\]/g, "")));
    const warningCode = asCode(warningMatch);
    fixes.push({
      path,
      ...(fix.from !== undefined ? { from: fix.from } : {}),
      ...(fix.to !== undefined ? { to: fix.to } : {}),
      message: warningCode ? warningToFixMessage(warningCode) : "입력값을 안전한 범위로 보정했습니다.",
    });
  });

  (extraFixes ?? []).forEach((fix) => {
    const path = toPath(fix.path);
    if (!path) return;
    fixes.push({
      path,
      ...(fix.from !== undefined ? { from: fix.from } : {}),
      ...(fix.to !== undefined ? { to: fix.to } : {}),
      message: typeof fix.message === "string" && fix.message.trim().length > 0
        ? fix.message.trim()
        : "입력값을 안전한 범위로 보정했습니다.",
    });
  });

  const dedupedFixes: NormalizationFixApplied[] = [];
  const seen = new Set<string>();
  fixes.forEach((fix) => {
    const key = `${fix.path}|${String(fix.from)}|${String(fix.to)}|${fix.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    dedupedFixes.push(fix);
  });

  return {
    defaultsApplied: Array.from(defaultSet),
    fixesApplied: dedupedFixes,
  };
}
