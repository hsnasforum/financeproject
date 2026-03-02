import { defaultTaxRatePct } from "../calc/taxPolicy";
import { getAllocationPolicy } from "./policy/presets";
import { type AllocationPolicyId } from "./policy/types";
import { loadCanonicalProfile } from "./loadCanonicalProfile";
import { type ProfileNormalizationDisclosure } from "./normalizationDisclosure";
import { PlanningV2ValidationError, type ProfileV2 } from "./types";

export type AppliedFix = {
  code: string;
  path: string;
  before?: unknown;
  after?: unknown;
  note?: string;
};

export type AppliedDefault = {
  code: string;
  path: string;
  value: unknown;
  note?: string;
};

export type NormalizationReport = {
  fixesApplied: AppliedFix[];
  defaultsApplied: AppliedDefault[];
};

type ValidationIssue = {
  path: string;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasTaxRateInRaw(raw: Record<string, unknown>): boolean {
  if (asNumber(raw.taxRatePct) !== undefined) return true;
  const assumptions = asRecord(raw.assumptions);
  if (asNumber(assumptions.taxRatePct) !== undefined) return true;
  const tax = asRecord(raw.tax);
  return asNumber(tax.taxRatePct) !== undefined;
}

function hasEmergencyMonthsInRaw(raw: Record<string, unknown>): boolean {
  const assumptions = asRecord(raw.assumptions);
  if (asNumber(assumptions.emergencyMonths) !== undefined) return true;
  const defaultsApplied = asRecord(raw.defaultsApplied);
  const defaultsAssumptions = asRecord(defaultsApplied.assumptions);
  return asNumber(defaultsAssumptions.emergencyMonths) !== undefined;
}

function collectBlockingAnomalies(raw: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const expenseFields: Array<{ key: string; path: string }> = [
    { key: "monthlyEssentialExpenses", path: "monthlyEssentialExpenses" },
    { key: "monthlyDiscretionaryExpenses", path: "monthlyDiscretionaryExpenses" },
  ];
  expenseFields.forEach((field) => {
    if (raw[field.key] === undefined || raw[field.key] === "") return;
    const value = asNumber(raw[field.key]);
    if (value === undefined) return;
    if (value < 0) {
      issues.push({
        path: field.path,
        message: "must be a finite number >= 0",
      });
    }
  });
  return issues;
}

function inferFixCode(path: string, before: unknown, after: unknown): string {
  if (
    path.includes("/aprPct")
    && typeof before === "number"
    && typeof after === "number"
    && before > 0
    && before <= 1
    && after > 1
    && after <= 100
  ) {
    return "APR_DECIMAL_TO_PCT";
  }
  if (before === "" && after === 0) {
    return "EMPTY_STRING_TO_ZERO";
  }
  return "NORMALIZE_VALUE";
}

function sortFixes(rows: AppliedFix[]): AppliedFix[] {
  return [...rows].sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path, "ko");
    if (pathCompare !== 0) return pathCompare;
    return a.code.localeCompare(b.code, "ko");
  });
}

function sortDefaults(rows: AppliedDefault[]): AppliedDefault[] {
  return [...rows].sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path, "ko");
    if (pathCompare !== 0) return pathCompare;
    return a.code.localeCompare(b.code, "ko");
  });
}

function dedupeFixes(rows: AppliedFix[]): AppliedFix[] {
  const seen = new Set<string>();
  const out: AppliedFix[] = [];
  rows.forEach((row) => {
    const key = `${row.code}|${row.path}|${JSON.stringify(row.before)}|${JSON.stringify(row.after)}|${row.note ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}

function dedupeDefaults(rows: AppliedDefault[]): AppliedDefault[] {
  const seen = new Set<string>();
  const out: AppliedDefault[] = [];
  rows.forEach((row) => {
    const key = `${row.code}|${row.path}|${JSON.stringify(row.value)}|${row.note ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}

function collectEmptyStringFixes(raw: Record<string, unknown>, profile: ProfileV2): AppliedFix[] {
  const fixes: AppliedFix[] = [];
  const topLevelNumericPaths: Array<{ path: string; rawValue: unknown; normalized: unknown }> = [
    { path: "/monthlyIncomeNet", rawValue: raw.monthlyIncomeNet, normalized: profile.monthlyIncomeNet },
    { path: "/monthlyEssentialExpenses", rawValue: raw.monthlyEssentialExpenses, normalized: profile.monthlyEssentialExpenses },
    { path: "/monthlyDiscretionaryExpenses", rawValue: raw.monthlyDiscretionaryExpenses, normalized: profile.monthlyDiscretionaryExpenses },
    { path: "/liquidAssets", rawValue: raw.liquidAssets, normalized: profile.liquidAssets },
    { path: "/investmentAssets", rawValue: raw.investmentAssets, normalized: profile.investmentAssets },
  ];
  topLevelNumericPaths.forEach((entry) => {
    if (entry.rawValue === "" && entry.normalized === 0) {
      fixes.push({
        code: "EMPTY_STRING_TO_ZERO",
        path: entry.path,
        before: "",
        after: 0,
        note: "빈 문자열 입력을 0으로 보정했습니다.",
      });
    }
  });

  const rawDebts = asArray(raw.debts);
  rawDebts.forEach((entry, index) => {
    const debt = asRecord(entry);
    const normalizedDebt = profile.debts[index];
    if (!normalizedDebt) return;
    const fields: Array<{ key: string; normalized: unknown }> = [
      { key: "balance", normalized: normalizedDebt.balance },
      { key: "minimumPayment", normalized: normalizedDebt.minimumPayment },
      { key: "aprPct", normalized: normalizedDebt.aprPct },
      { key: "apr", normalized: normalizedDebt.aprPct },
      { key: "remainingMonths", normalized: normalizedDebt.remainingMonths },
    ];
    fields.forEach((field) => {
      if (debt[field.key] === "" && field.normalized === 0) {
        fixes.push({
          code: "EMPTY_STRING_TO_ZERO",
          path: `/debts/${index}/${field.key === "apr" ? "aprPct" : field.key}`,
          before: "",
          after: 0,
          note: "빈 문자열 입력을 0으로 보정했습니다.",
        });
      }
    });
  });

  return fixes;
}

export function reportFromNormalizationDisclosure(
  disclosure: ProfileNormalizationDisclosure | null | undefined,
  sourceNote?: string,
): NormalizationReport {
  if (!disclosure) {
    return { fixesApplied: [], defaultsApplied: [] };
  }

  const fixes: AppliedFix[] = (disclosure.fixesApplied ?? []).map((fix) => ({
    code: inferFixCode(asString(fix.path), fix.from, fix.to),
    path: asString(fix.path) || "/profile",
    ...(fix.from !== undefined ? { before: fix.from } : {}),
    ...(fix.to !== undefined ? { after: fix.to } : {}),
    ...(fix.message ? { note: sourceNote ? `${sourceNote}: ${fix.message}` : fix.message } : {}),
  }));

  const defaults: AppliedDefault[] = (disclosure.defaultsApplied ?? [])
    .map((code) => asString(code))
    .filter((code) => code.length > 0)
    .map((code) => ({
      code,
      path: "/profile",
      value: true,
      ...(sourceNote ? { note: sourceNote } : {}),
    }));

  return {
    fixesApplied: sortFixes(dedupeFixes(fixes)),
    defaultsApplied: sortDefaults(dedupeDefaults(defaults)),
  };
}

export function mergeNormalizationReports(reports: NormalizationReport[]): NormalizationReport {
  const fixes = reports.flatMap((report) => report.fixesApplied);
  const defaults = reports.flatMap((report) => report.defaultsApplied);
  return {
    fixesApplied: sortFixes(dedupeFixes(fixes)),
    defaultsApplied: sortDefaults(dedupeDefaults(defaults)),
  };
}

export function normalizeProfileWithReport(
  rawProfile: unknown,
  policyId: AllocationPolicyId = "balanced",
): { profile: ProfileV2; report: NormalizationReport } {
  const raw = asRecord(rawProfile);
  const blockingIssues = collectBlockingAnomalies(raw);
  if (blockingIssues.length > 0) {
    throw new PlanningV2ValidationError("Invalid profile input", blockingIssues);
  }

  const canonical = loadCanonicalProfile(rawProfile);
  const base = reportFromNormalizationDisclosure(canonical.normalization);

  const fixesApplied: AppliedFix[] = [...base.fixesApplied];
  fixesApplied.push(...collectEmptyStringFixes(raw, canonical.profile));

  const defaultsApplied: AppliedDefault[] = [...base.defaultsApplied];
  if (!hasTaxRateInRaw(raw)) {
    defaultsApplied.push({
      code: "DEFAULT_TAX_RATE",
      path: "/assumptions/taxRatePct",
      value: defaultTaxRatePct,
      note: "세율 입력이 없어 기본 세율을 사용했습니다.",
    });
  }

  if (!hasEmergencyMonthsInRaw(raw)) {
    const emergencyMonths = getAllocationPolicy(policyId).rules.minEmergencyMonths;
    defaultsApplied.push({
      code: "DEFAULT_EMERGENCY_MONTHS",
      path: "/assumptions/emergencyMonths",
      value: emergencyMonths,
      note: "정책 프리셋 기준 비상금 개월 수를 적용했습니다.",
    });
  }

  return {
    profile: canonical.profile,
    report: {
      fixesApplied: sortFixes(dedupeFixes(fixesApplied)),
      defaultsApplied: sortDefaults(dedupeDefaults(defaultsApplied)),
    },
  };
}
