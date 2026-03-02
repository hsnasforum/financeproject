const CANONICAL_MONTHS = [3, 6, 12, 24, 36, 48, 60];

export type KdbParsedOption = {
  termMonths: number | null;
  ratePct: number | null;
  evidence: string[];
};

export type KdbParsedResult = {
  options: KdbParsedOption[];
  notes: string[];
};

function toText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseRatePct(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseTermFromText(text: string): number | null {
  const year = text.match(/(\d+)\s*년/);
  if (year?.[1]) {
    const n = Number(year[1]);
    if (Number.isFinite(n) && n > 0) return n * 12;
  }

  const month = text.match(/(\d+)\s*(?:개월|month|months)/i);
  if (month?.[1]) {
    const n = Number(month[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function parseTermRangeMonths(text: string): { minMonths: number; maxMonths: number } | null {
  const compact = text.replace(/\s+/g, "");

  const yearRange = compact.match(/(\d+)년이상~(\d+)년이하/);
  if (yearRange?.[1] && yearRange?.[2]) {
    const minY = Number(yearRange[1]);
    const maxY = Number(yearRange[2]);
    if (Number.isFinite(minY) && Number.isFinite(maxY) && minY > 0 && maxY >= minY) {
      return { minMonths: minY * 12, maxMonths: maxY * 12 };
    }
  }

  const monthRange = compact.match(/(\d+)개월이상~(\d+)개월이하/);
  if (monthRange?.[1] && monthRange?.[2]) {
    const minM = Number(monthRange[1]);
    const maxM = Number(monthRange[2]);
    if (Number.isFinite(minM) && Number.isFinite(maxM) && minM > 0 && maxM >= minM) {
      return { minMonths: minM, maxMonths: maxM };
    }
  }

  const mixedRange = compact.match(/(\d+)년이상~(\d+)개월이하/);
  if (mixedRange?.[1] && mixedRange?.[2]) {
    const minY = Number(mixedRange[1]);
    const maxM = Number(mixedRange[2]);
    if (Number.isFinite(minY) && Number.isFinite(maxM) && minY > 0 && maxM >= minY * 12) {
      return { minMonths: minY * 12, maxMonths: maxM };
    }
  }

  return null;
}

function pickCandidatesFromRange(range: { minMonths: number; maxMonths: number }): number[] {
  const picked = CANONICAL_MONTHS.filter((months) => months >= range.minMonths && months <= range.maxMonths);
  if (picked.length > 0) return picked;

  if (range.minMonths > CANONICAL_MONTHS[CANONICAL_MONTHS.length - 1]) {
    return [CANONICAL_MONTHS[CANONICAL_MONTHS.length - 1]];
  }
  if (range.maxMonths < CANONICAL_MONTHS[0]) {
    return [CANONICAL_MONTHS[0]];
  }
  return [range.minMonths];
}

export function parseKdbRateAndTerm(raw: {
  hitIrtCndCone?: string;
  prdJinTrmCone?: string;
  [key: string]: unknown;
}): KdbParsedResult {
  const hitRateText = toText(raw.hitIrtCndCone);
  const termConditionText = toText(raw.prdJinTrmCone);

  const ratePct = parseRatePct(hitRateText);
  if (ratePct === null) {
    return {
      options: [],
      notes: ["KDB 원본에서 금리 문자열(hitIrtCndCone)을 파싱하지 못해 추천 후보에서 제외했습니다."],
    };
  }

  const evidenceBase = [
    `hitIrtCndCone=${hitRateText || "(empty)"}`,
    termConditionText ? `prdJinTrmCone=${termConditionText}` : "prdJinTrmCone=(empty)",
  ];

  const explicitTerm = parseTermFromText(hitRateText);
  if (explicitTerm !== null) {
    return {
      options: [{ termMonths: explicitTerm, ratePct, evidence: [...evidenceBase, "금리 문자열에서 기간을 직접 추출"] }],
      notes: ["KDB 금리/기간은 원문 문자열 파싱 결과이며 세부 우대조건은 상품별로 다를 수 있습니다."],
    };
  }

  const range = parseTermRangeMonths(termConditionText);
  if (range) {
    const terms = pickCandidatesFromRange(range);
    return {
      options: terms.map((months) => ({
        termMonths: months,
        ratePct,
        evidence: [...evidenceBase, `기간별 세부 금리 미제공으로 ${months}개월 동일 금리 가정`],
      })),
      notes: [
        "KDB 원문은 기간 구간만 제공되어 canonical 기간에 동일 금리를 가정했습니다.",
        "가정 기반 옵션이므로 실제 적용금리는 조건에 따라 달라질 수 있습니다.",
      ],
    };
  }

  return {
    options: [{ termMonths: null, ratePct, evidence: [...evidenceBase, "기간 정보 부재로 금리만 사용"] }],
    notes: ["KDB 기간 정보가 불명확하여 기간 무관 옵션으로 비교했습니다(가정 포함)."],
  };
}
