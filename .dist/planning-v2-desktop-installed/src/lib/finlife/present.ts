import { type FinlifeFieldSpec } from "@/lib/finlife/fieldConfig";
import { formatGlossaryValue, getGlossaryLabel } from "@/lib/finlife/glossary";
import { type FinlifeKind } from "@/lib/finlife/types";

const HIDDEN_KEY_RE = /(fin_prdt_cd|fin_co_no|dcls_month|service|token|auth|key)/i;

type PresentValue = {
  label: string;
  valueText: string;
  help?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase();
}

function findEntry(raw: Record<string, unknown>, keys: string[]): [string, unknown] | null {
  const entries = Object.entries(raw);
  for (const key of keys) {
    const wanted = normalizeKey(key);
    const hit = entries.find(([entryKey]) => normalizeKey(entryKey) === wanted);
    if (!hit) continue;
    const rendered = String(hit[1] ?? "").trim();
    if (!rendered) continue;
    return hit;
  }
  return null;
}

function shouldHideCodeKey(raw: Record<string, unknown>, key: string): boolean {
  if (HIDDEN_KEY_RE.test(key)) return true;
  if (/_nm$/i.test(key)) return false;
  if (/_type$/i.test(key)) {
    const baseNm = key.replace(/_type$/i, "_type_nm");
    if (findEntry(raw, [baseNm])) return true;
    return true;
  }
  return false;
}

export function presentValue(kind: FinlifeKind, key: string, value: unknown, raw?: Record<string, unknown>): PresentValue | null {
  const source = raw ?? {};
  if (shouldHideCodeKey(source, key)) return null;

  const label = getGlossaryLabel(key);
  if (!label) return null;

  const valueText = formatGlossaryValue(key, value);
  if (!valueText) return null;

  return { label, valueText };
}

export function presentBySpecs(kind: FinlifeKind, raw: unknown, specs: FinlifeFieldSpec[] | undefined): PresentValue[] {
  if (!isRecord(raw) || !specs?.length) return [];
  const out: PresentValue[] = [];

  for (const spec of specs) {
    const hit = findEntry(raw, spec.keys);
    if (!hit) continue;
    const presented = presentValue(kind, hit[0], hit[1], raw);
    if (!presented) continue;
    out.push({ ...presented, help: spec.help });
  }

  return out;
}

export function presentOptionFallback(kind: FinlifeKind, raw: unknown, limit = 8): PresentValue[] {
  if (!isRecord(raw)) return [];
  const out: PresentValue[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const presented = presentValue(kind, key, value, raw);
    if (!presented) continue;
    if (out.some((entry) => entry.label === presented.label)) continue;
    out.push(presented);
    if (out.length >= limit) break;
  }
  return out;
}
