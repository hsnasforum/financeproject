import { type StepId } from "@/lib/planning/ui/runPipeline";
import { formatDate } from "@/lib/planning/i18n/format";
import { type Locale } from "@/lib/planning/i18n";

export const STEP_LABELS: Record<StepId, string> = {
  simulate: "simulate",
  scenarios: "scenarios",
  monteCarlo: "monte carlo",
  actions: "actions",
  debtStrategy: "debt strategy",
};

export function normalizeLooseNumberText(value: string): string {
  return value.replaceAll(",", "").trim();
}

export function toFiniteNumber(value: string, fallback = 0): number {
  const normalized = normalizeLooseNumberText(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatGroupedIntegerInput(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("ko-KR").format(Math.round(numeric));
}

export function monthOffsetToInput(targetMonth: number): string {
  const normalized = Number.isFinite(targetMonth) ? Math.trunc(targetMonth) : 1;
  return String(Math.min(1200, Math.max(1, normalized)));
}

export function inputToMonthOffset(value: string, fallback = 1): number {
  const normalizedFallback = Math.min(1200, Math.max(1, Math.trunc(fallback || 1)));
  const parsed = toFiniteNumber(value, normalizedFallback);
  return Math.min(1200, Math.max(1, Math.trunc(parsed)));
}

export function formatDateTime(locale: Locale, value?: string): string {
  return formatDate(locale, value);
}

export function formatSeverityKo(value: unknown): string {
  const severity = String(value ?? "").trim();
  if (severity === "critical") return "치명";
  if (severity === "warn") return "경고";
  if (severity === "info") return "정보";
  return severity || "-";
}
