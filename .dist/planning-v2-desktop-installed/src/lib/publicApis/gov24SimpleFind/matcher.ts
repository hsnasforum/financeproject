import { type BenefitCandidate } from "../contracts/types";
import { type Gov24SimpleFindInput, type Gov24IncomeBracket } from "./types";

type MatchEvidence = { keyword: string; field: string };

const INCOME_KEYWORDS: Record<Gov24IncomeBracket, string[]> = {
  "0_50": ["중위소득 50", "기준중위소득 50", "중위소득50", "50% 이하"],
  "51_75": ["중위소득 75", "기준중위소득 75", "중위소득75", "75% 이하"],
  "76_100": ["중위소득 100", "기준중위소득 100", "중위소득100", "100% 이하"],
  "101_200": ["중위소득 200", "기준중위소득 200", "중위소득200", "200% 이하"],
  "200_plus": ["중위소득 200", "200% 이상", "중위소득 200 이상"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenizeQuery(query: string): string[] {
  return query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function computeAge(yyyymmdd: string): number | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null;
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1;
  const d = today.getDate();
  if (month > m || (month === m && day > d)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function ageBoostKeywords(age: number | null): string[] {
  if (age === null) return [];
  if (age >= 19 && age <= 34) return ["청년"];
  if (age >= 65) return ["고령", "노인"];
  if (age <= 18) return ["아동", "청소년"];
  return [];
}

function pickFields(item: BenefitCandidate): Array<{ field: string; text: string; weight: number }> {
  const hints = (item.eligibilityHints ?? []).join(" ");
  return [
    { field: "제목", text: item.title ?? "", weight: 3.5 },
    { field: "요약", text: item.summary ?? "", weight: 2.5 },
    { field: "조건", text: `${item.eligibilityText ?? ""} ${item.eligibilityExcerpt ?? ""} ${hints}`, weight: 2.2 },
    { field: "신청방법", text: item.applyHow ?? "", weight: 1.2 },
    { field: "기관", text: item.org ?? "", weight: 1.0 },
  ];
}

export function buildSimpleFindKeywords(input: Gov24SimpleFindInput): string[] {
  const base = new Set<string>();
  for (const keyword of INCOME_KEYWORDS[input.incomeBracket]) base.add(keyword);
  for (const trait of input.personalTraits) {
    if (trait !== "해당사항 없음") base.add(trait);
  }
  for (const trait of input.householdTraits) {
    if (trait !== "해당사항 없음") base.add(trait);
  }
  for (const token of tokenizeQuery(input.q ?? "")) {
    base.add(token);
  }
  for (const token of ageBoostKeywords(computeAge(input.birth.yyyymmdd))) {
    base.add(token);
  }
  if (input.birth.gender === "F" && (input.personalTraits.includes("임산부") || input.personalTraits.includes("한부모가정"))) {
    base.add("여성");
    base.add("임산부");
  }
  return [...base];
}

export function scoreSimpleFindItem(item: BenefitCandidate, input: Gov24SimpleFindInput): { score: number; evidence: MatchEvidence[] } {
  const keywords = buildSimpleFindKeywords(input).map((keyword) => normalize(keyword));
  const fields = pickFields(item).map((entry) => ({ ...entry, text: normalize(entry.text) }));
  let score = 0;
  const evidence: MatchEvidence[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    for (const field of fields) {
      if (!keyword || !field.text.includes(keyword)) continue;
      score += field.weight;
      const key = `${keyword}:${field.field}`;
      if (!seen.has(key) && evidence.length < 5) {
        evidence.push({ keyword, field: field.field });
        seen.add(key);
      }
      break;
    }
  }

  if (item.region.scope === "REGIONAL") {
    const tags = item.region.tags ?? [];
    const exact = `${input.region.sido} ${input.region.sigungu}`;
    if (tags.includes(exact)) {
      score += 2.5;
      if (evidence.length < 5) evidence.push({ keyword: exact, field: "지역" });
    } else if (tags.includes(input.region.sido)) {
      score += 1.5;
      if (evidence.length < 5) evidence.push({ keyword: input.region.sido, field: "지역" });
    }
  } else if (item.region.scope === "NATIONWIDE") {
    score += 1;
    if (evidence.length < 5) evidence.push({ keyword: "전국", field: "지역" });
  }

  return { score: Math.round(score * 10) / 10, evidence };
}

export function rankBySimpleFind(items: BenefitCandidate[], input: Gov24SimpleFindInput): BenefitCandidate[] {
  const scored = items.map((item) => {
    const match = scoreSimpleFindItem(item, input);
    return { ...item, simpleFindMatch: match };
  });
  scored.sort((a, b) => (b.simpleFindMatch?.score ?? 0) - (a.simpleFindMatch?.score ?? 0));
  return scored;
}

export function paginateByCursor<T>(items: T[], cursor: number, pageSize: number): { items: T[]; nextCursor: number | null; hasMore: boolean } {
  const start = Math.max(0, Math.trunc(cursor));
  const size = Math.max(1, Math.min(200, Math.trunc(pageSize)));
  const sliced = items.slice(start, start + size);
  const nextCursor = start + size < items.length ? start + size : null;
  return { items: sliced, nextCursor, hasMore: nextCursor !== null };
}

