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
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = Math.max(1, Math.trunc(targetMonth || 1));
  const next = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function inputToMonthOffset(value: string): number {
  if (!/^\d{4}-\d{2}$/.test(value.trim())) return 1;
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return 1;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const target = new Date(year, month - 1, 1);
  const diffMonths = (target.getFullYear() - base.getFullYear()) * 12 + (target.getMonth() - base.getMonth());
  return Math.max(1, diffMonths);
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
