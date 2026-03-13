import { type ProfileV2 } from "../v2/types";
import { roundKrw } from "../calc/roundingPolicy";

export type MaskLevel = "light" | "standard" | "strict";

const MONEY_KEY_PATTERN = /(amount|income|expense|asset|balance|cash|debt|worth|payment|krw|principal|interest|target|shortfall|gap|payout|contribution)/i;
const RATE_KEY_PATTERN = /(ratio|pct|rate|probability|progress)/i;
const SENSITIVE_KEY_PATTERN = /(region|sido|sigungu|company|employer|workplace|location|address|corp|organization)/i;

function asMaskLevel(level: unknown): MaskLevel {
  if (level === "light" || level === "standard" || level === "strict") return level;
  return "standard";
}

function bucketLabel(amount: number, level: MaskLevel): string {
  const abs = Math.max(0, roundKrw(amount));
  if (level === "light") {
    const rounded = roundKrw(abs / 100_000) * 100_000;
    return `약 ${rounded.toLocaleString("ko-KR")}원`;
  }
  if (level === "strict") {
    if (abs < 1_000_000) return "0~100만원";
    if (abs < 10_000_000) return "100만원~1,000만원";
    if (abs < 100_000_000) return "1,000만원~1억원";
    return "1억원 이상";
  }

  const bands = [
    1_000_000,
    5_000_000,
    10_000_000,
    30_000_000,
    50_000_000,
    100_000_000,
    300_000_000,
    500_000_000,
    1_000_000_000,
  ];
  let lower = 0;
  for (const upper of bands) {
    if (abs < upper) {
      return `${roundKrw(lower / 10_000).toLocaleString("ko-KR")}만~${roundKrw(upper / 10_000).toLocaleString("ko-KR")}만원`;
    }
    lower = upper;
  }
  return "10억원 이상";
}

function maskAge(age: number, level: MaskLevel): string | number {
  const safe = Math.max(0, roundKrw(age));
  if (level === "light") return safe;
  if (level === "standard") {
    const lower = Math.trunc(safe / 5) * 5;
    return `${lower}~${lower + 4}세`;
  }
  const lower = Math.trunc(safe / 10) * 10;
  return `${lower}대`;
}

function sanitizeTitle(prefix: "Loan" | "Goal", index: number): string {
  if (prefix === "Loan") {
    const code = String.fromCharCode(65 + (index % 26));
    return `Loan ${code}`;
  }
  return `Goal ${index + 1}`;
}

function maskValue(value: unknown, key: string | null, level: MaskLevel): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (key && /age/i.test(key)) return maskAge(value, level);
    if (key && RATE_KEY_PATTERN.test(key)) return value;
    if (!key || !MONEY_KEY_PATTERN.test(key)) return value;
    return bucketLabel(value, level);
  }
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, key, level));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (entryKey === "birthYear") continue;
      if (SENSITIVE_KEY_PATTERN.test(entryKey)) {
        out[entryKey] = "[REDACTED]";
        continue;
      }
      out[entryKey] = maskValue(entryValue, entryKey, level);
    }
    return out;
  }
  return value;
}

export function maskProfile(profile: ProfileV2, level: MaskLevel = "standard"): Record<string, unknown> {
  const resolvedLevel = asMaskLevel(level);
  const source = structuredClone(profile) as Record<string, unknown>;
  const out = maskValue(source, null, resolvedLevel) as Record<string, unknown>;

  if (Array.isArray(profile.debts)) {
    out.debts = profile.debts.map((debt, index) => ({
      ...maskValue(debt, null, resolvedLevel) as Record<string, unknown>,
      id: `loan-${index + 1}`,
      name: sanitizeTitle("Loan", index),
    }));
  }
  if (Array.isArray(profile.goals)) {
    out.goals = profile.goals.map((goal, index) => ({
      ...maskValue(goal, null, resolvedLevel) as Record<string, unknown>,
      id: `goal-${index + 1}`,
      name: sanitizeTitle("Goal", index),
    }));
  }
  if (typeof profile.currentAge === "number" && Number.isFinite(profile.currentAge)) {
    out.currentAge = maskAge(profile.currentAge, resolvedLevel);
  }
  delete out.birthYear;
  return out;
}

export function maskPlan(plan: unknown, level: MaskLevel = "standard"): Record<string, unknown> {
  const resolvedLevel = asMaskLevel(level);
  const cloned = structuredClone(plan) as unknown;
  return maskValue(cloned, null, resolvedLevel) as Record<string, unknown>;
}
