import { type NormalizedProduct } from "@/lib/finlife/types";

export type HighlightRow = {
  key: string;
  label: string;
  value: string;
};

export type ProductHighlights = {
  joinTargetLabel: string;
  specialRateHint: string;
  conditionsComplexity: "단순" | "보통" | "복잡";
  notesExcerpt: string;
};

const LABEL_MAP: Record<string, string> = {
  intr_rate_type_nm: "이자 방식",
  save_trm: "가입 기간",
  intr_rate: "기본 금리",
  intr_rate2: "최고 금리",
  kor_co_nm: "금융사",
  fin_prdt_nm: "상품명",
  join_way: "가입 방법",
  join_member: "가입 대상",
  spcl_cnd: "우대 조건",
  mtrt_int: "만기 후 이자",
};

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

export function isSensitiveKeyName(key: string): boolean {
  const lowered = normalizeKey(key);
  return /(auth|servicekey|api[_-]?key|secret|token|resident|rrn|phone|mobile|email|addr)/.test(lowered);
}

function humanizeValue(key: string, value: unknown): string {
  const text = toText(value);
  if (!text) return "";
  if (key === "save_trm" && /^\d+$/.test(text)) return `${text}개월`;
  if ((key === "intr_rate" || key === "intr_rate2") && /^-?\d+(\.\d+)?$/.test(text)) return `${Number(text).toFixed(2)}%`;
  return text;
}

export function pickHighlights(
  raw: Record<string, unknown>,
  preferredKeys?: string[],
  options?: { audience?: "user" | "dev"; limit?: number },
): HighlightRow[] {
  const limit = Math.max(1, Math.trunc(options?.limit ?? 8));
  const orderedKeys = preferredKeys && preferredKeys.length ? preferredKeys : Object.keys(raw);
  const rows: HighlightRow[] = [];
  for (const key of orderedKeys) {
    if (!(key in raw)) continue;
    if (options?.audience === "user" && isSensitiveKeyName(key)) continue;
    const label = LABEL_MAP[key] ?? (options?.audience === "user" ? "" : key);
    if (!label) continue;
    const value = humanizeValue(key, raw[key]);
    if (!value) continue;
    rows.push({ key, label, value });
    if (rows.length >= limit) break;
  }
  return rows;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map((entry) => toText(entry)).filter(Boolean).join(" ");
  return "";
}

function collectTexts(product: NormalizedProduct): string[] {
  const texts: string[] = [];
  for (const value of Object.values(product.raw ?? {})) {
    const text = toText(value);
    if (text) texts.push(text);
  }
  for (const option of product.options) {
    for (const value of Object.values(option.raw ?? {})) {
      const text = toText(value);
      if (text) texts.push(text);
    }
  }
  return texts.map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function pickByKey(raw: Record<string, unknown>, keywords: string[]): string | null {
  for (const [key, value] of Object.entries(raw)) {
    const lowered = key.toLowerCase();
    if (!keywords.some((k) => lowered.includes(k))) continue;
    const text = toText(value);
    if (text) return text;
  }
  return null;
}

function shorten(text: string, max = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max).trim()}...` : t;
}

export function summarizeProductHighlights(product: NormalizedProduct): ProductHighlights {
  const joinTarget =
    pickByKey(product.raw, ["join_member", "joinmember", "join_deny", "join_target", "가입대상", "대상"]) ?? "";
  const special =
    pickByKey(product.raw, ["spcl", "special", "우대", "prefer", "preferential"]) ??
    product.options.map((option) => pickByKey(option.raw, ["spcl", "special", "우대", "prefer"])).find(Boolean) ??
    "";
  const notes =
    pickByKey(product.raw, ["etc", "note", "유의", "주의", "기타"]) ??
    product.options.map((option) => pickByKey(option.raw, ["etc", "note", "유의", "주의", "기타"]) ).find(Boolean) ??
    "";

  const joinedText = [joinTarget, special, notes, ...collectTexts(product).slice(0, 8)].join(" ");
  const complexityScore =
    (special.length > 60 ? 2 : special.length > 20 ? 1 : 0) +
    (notes.length > 80 ? 2 : notes.length > 30 ? 1 : 0) +
    (/(제출|실적|유지|충족|증빙|확인)/.test(joinedText) ? 1 : 0);

  const conditionsComplexity = complexityScore >= 4 ? "복잡" : complexityScore >= 2 ? "보통" : "단순";

  const joinTargetLabel =
    joinTarget.length === 0
      ? "가입대상 정보 없음(공시 누락)"
      : /(누구나|제한없음|제한 없음|개인 및 법인)/.test(joinTarget)
        ? "가입대상: 누구나"
        : "가입대상: 대상 제한";

  return {
    joinTargetLabel,
    specialRateHint: special ? shorten(`우대조건: ${special}`, 100) : "우대조건 정보 없음(공시 누락)",
    conditionsComplexity,
    notesExcerpt: notes ? shorten(notes, 100) : "기타 유의사항 정보 없음",
  };
}
