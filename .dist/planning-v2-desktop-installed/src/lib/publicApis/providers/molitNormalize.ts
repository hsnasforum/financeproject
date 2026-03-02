type MolitRow = Record<string, unknown>;

const AREA_KEYS = ["전용면적", "area", "exclusiveArea", "excluUseAr"] as const;
const AREA_MIN_M2 = 10;
const AREA_MAX_M2 = 300;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function normalizeBaseUrl(raw: string, fallback: string): string {
  return (raw || fallback).trim().replace(/\/+$/, "");
}

export function buildEndpoint(base: string, pathSuffix: string): string {
  const trimmed = pathSuffix.replace(/^\/+/, "");
  if (base.toLowerCase().includes(trimmed.toLowerCase())) {
    return base;
  }
  return `${base}/${trimmed}`;
}

export function encodeServiceKey(key: string): string {
  return /%[0-9a-fA-F]{2}/.test(key) ? key : encodeURIComponent(key);
}

export function buildServiceKeyQuery(serviceKey: string): string {
  return `serviceKey=${encodeServiceKey(serviceKey)}`;
}

export function buildApiUrl(endpoint: string, serviceKey: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  const sep = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${sep}${buildServiceKeyQuery(serviceKey)}${search ? `&${search}` : ""}`;
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXmlEntities(value: string): string {
  const named = value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");

  const decodedHex = named.replace(/&#x([0-9a-fA-F]+);/g, (_all, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });

  return decodedHex.replace(/&#([0-9]+);/g, (_all, dec: string) => {
    const code = Number.parseInt(dec, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });
}

function normalizeTagValue(value: string): string {
  return decodeXmlEntities(stripCdata(value.trim()));
}

function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key.toLowerCase());
}

function parseFlatItem(itemXml: string): MolitRow {
  const out: MolitRow = Object.create(null) as MolitRow;
  const tagRe = /<([a-zA-Z0-9_가-힣:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<([a-zA-Z0-9_가-힣:-]+)(?:\s[^>]*)?\s*\/>/g;
  let match: RegExpExecArray | null = tagRe.exec(itemXml);
  while (match) {
    const key = (match[1] ?? match[3] ?? "").trim();
    if (key && !isUnsafeKey(key)) {
      const value = typeof match[2] === "string" ? normalizeTagValue(match[2]) : "";
      out[key] = value;
    }
    match = tagRe.exec(itemXml);
  }
  return out;
}

function matchTagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(xml);
  if (match) return normalizeTagValue(match[1]);
  const selfClosingRe = new RegExp(`<${tag}(?:\\s[^>]*)?\\s*\\/\\s*>`, "i");
  return selfClosingRe.test(xml) ? "" : null;
}

function matchFirstTagContent(xml: string, tags: string[]): string | null {
  for (const tag of tags) {
    const matched = matchTagContent(xml, tag);
    if (matched !== null) return matched;
  }
  return null;
}

function parseXmlLikeMolit(xml: string): { response: { header: { resultCode?: string; resultMsg?: string }; body: { items: { item: MolitRow[] } } } } {
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const rows: MolitRow[] = [];
  let match: RegExpExecArray | null = itemRe.exec(xml);
  while (match) {
    const row = parseFlatItem(match[1]);
    if (Object.keys(row).length > 0) rows.push(row);
    match = itemRe.exec(xml);
  }

  return {
    response: {
      header: {
        resultCode: matchTagContent(xml, "resultCode") ?? undefined,
        resultMsg: matchTagContent(xml, "resultMsg") ?? undefined,
      },
      body: {
        items: { item: rows },
      },
    },
  };
}

export function parseMolitBody(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const text = raw.trim();
  if (!text.startsWith("<")) return raw;
  return parseXmlLikeMolit(text);
}

export function isMolitSuccessCode(code?: string): boolean {
  if (!code) return true;
  return /^0+$/.test(code.trim());
}

export function getMolitHeader(raw: unknown): { resultCode?: string; resultMsg?: string } {
  const xmlText = typeof raw === "string" ? raw : "";
  const parsed = parseMolitBody(raw);
  if (!parsed || typeof parsed !== "object") return {};
  const rec = parsed as { response?: { header?: Record<string, unknown> }; header?: Record<string, unknown> };
  const header = (rec.response?.header ?? rec.header ?? {}) as Record<string, unknown>;
  const baseCode = typeof header.resultCode === "string" ? header.resultCode : undefined;
  const baseMsg = typeof header.resultMsg === "string" ? header.resultMsg : undefined;
  const resultCode = baseCode ?? matchFirstTagContent(xmlText, ["returnReasonCode"]) ?? undefined;
  const resultMsg = baseMsg ?? matchFirstTagContent(xmlText, ["returnAuthMsg", "errMsg"]) ?? undefined;
  return { resultCode, resultMsg };
}

export function getMolitItems(raw: unknown): MolitRow[] {
  const parsed = parseMolitBody(raw);
  if (Array.isArray(parsed)) {
    return parsed.filter((row): row is MolitRow => Boolean(row) && typeof row === "object");
  }
  if (!parsed || typeof parsed !== "object") return [];
  const byItems = (parsed as { items?: unknown }).items;
  if (Array.isArray(byItems)) {
    return byItems.filter((row): row is MolitRow => Boolean(row) && typeof row === "object");
  }
  const byResponse = (parsed as { response?: { body?: { items?: { item?: unknown } } } }).response?.body?.items?.item;
  if (Array.isArray(byResponse)) {
    return byResponse.filter((row): row is MolitRow => Boolean(row) && typeof row === "object");
  }
  if (byResponse && typeof byResponse === "object") {
    return [byResponse as MolitRow];
  }
  return [];
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseArea(value: unknown): number | null {
  return parseAmount(value);
}

function findAreaByExactKeys(row: MolitRow): number | null {
  const direct = AREA_KEYS.map((k) => parseArea(row[k])).find((v): v is number => v !== null);
  if (direct !== undefined) return direct;

  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    if (isUnsafeKey(key)) continue;
    const exactMatch = AREA_KEYS.some((k) => k.toLowerCase() === key.toLowerCase());
    if (!exactMatch) continue;
    const parsed = parseArea(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function isLikelyAreaKey(key: string): boolean {
  const lower = key.toLowerCase();
  return /전용|면적/.test(key) || lower.includes("exclu") || lower.includes("exclusive") || lower.includes("area");
}

function findAreaByFallbackKeys(row: MolitRow): number | null {
  for (const [key, value] of Object.entries(row)) {
    if (isUnsafeKey(key) || !isLikelyAreaKey(key)) continue;
    const parsed = parseArea(value);
    if (parsed === null) continue;
    if (parsed >= AREA_MIN_M2 && parsed <= AREA_MAX_M2) return parsed;
  }
  return null;
}

function findArea(row: MolitRow): number | null {
  return findAreaByExactKeys(row) ?? findAreaByFallbackKeys(row);
}

export function filterRowsByAreaBand(rows: MolitRow[], areaBand: string, tolerance = 10): MolitRow[] {
  const target = Number(areaBand);
  if (!Number.isFinite(target) || target <= 0) return rows;
  return rows.filter((row) => {
    const area = findArea(row);
    return area !== null && Math.abs(area - target) <= tolerance;
  });
}

export function extractSaleAmountsFromRows(rows: MolitRow[]): number[] {
  return rows
    .map((rec) => parseAmount(rec.dealAmount ?? rec.거래금액 ?? rec.rentAmt ?? rec.deposit ?? rec.price))
    .filter((v): v is number => typeof v === "number");
}

function parseRentType(raw: MolitRow): "JEONSE" | "WOLSE" | null {
  const txt = String(raw.rentType ?? raw.rentGbn ?? raw.전월세구분 ?? raw.contractType ?? "").toLowerCase();
  if (txt.includes("전세") || txt.includes("jeonse")) return "JEONSE";
  if (txt.includes("월세") || txt.includes("wolse")) return "WOLSE";
  return null;
}

export type RentRow = {
  deposit: number;
  monthly: number;
};

export function extractRentRowsFromRows(rows: MolitRow[]): RentRow[] {
  return rows
    .map((rec) => {
      const deposit = parseAmount(rec.deposit ?? rec.보증금액 ?? rec.depositAmount ?? rec.depositAmt ?? rec.jdeposit);
      const monthly = parseAmount(rec.monthlyRent ?? rec.월세금액 ?? rec.rentFee ?? rec.rentAmt ?? rec.mrent);
      const parsedType = parseRentType(rec);
      if (parsedType === "JEONSE") {
        if (deposit === null) return null;
        return { deposit, monthly: 0 };
      }
      if (parsedType === "WOLSE") {
        if (deposit === null && monthly === null) return null;
        return { deposit: deposit ?? 0, monthly: monthly ?? 0 };
      }
      if (deposit === null && monthly === null) return null;
      return { deposit: deposit ?? 0, monthly: monthly ?? 0 };
    })
    .filter((v): v is RentRow => Boolean(v));
}
