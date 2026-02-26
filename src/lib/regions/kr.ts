import { SIDO_ADMIN_2025, SIGUNGU_BY_SIDO_CODE_2025 } from "./kr_admin_2025";

export const SIDO_LIST = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

export type RegionScope = "NATIONWIDE" | "REGIONAL" | "UNKNOWN";

type RegionExtracted = {
  scope: RegionScope;
  tags: string[];
  sido?: string;
  sigungu?: string;
};

const SIDO_ALIAS_ENTRIES: Array<[alias: string, canonical: (typeof SIDO_LIST)[number]]> = [
  ["서울특별시", "서울"],
  ["서울시", "서울"],
  ["서울", "서울"],
  ["부산광역시", "부산"],
  ["부산시", "부산"],
  ["부산", "부산"],
  ["대구광역시", "대구"],
  ["대구시", "대구"],
  ["대구", "대구"],
  ["인천광역시", "인천"],
  ["인천시", "인천"],
  ["인천", "인천"],
  ["광주광역시", "광주"],
  ["광주시", "광주"],
  ["광주", "광주"],
  ["대전광역시", "대전"],
  ["대전시", "대전"],
  ["대전", "대전"],
  ["울산광역시", "울산"],
  ["울산시", "울산"],
  ["울산", "울산"],
  ["세종특별자치시", "세종"],
  ["세종시", "세종"],
  ["세종", "세종"],
  ["경기도", "경기"],
  ["경기", "경기"],
  ["강원특별자치도", "강원"],
  ["강원도", "강원"],
  ["강원", "강원"],
  ["충청북도", "충북"],
  ["충북", "충북"],
  ["충청남도", "충남"],
  ["충남", "충남"],
  ["전북특별자치도", "전북"],
  ["전라북도", "전북"],
  ["전북", "전북"],
  ["전라남도", "전남"],
  ["전남", "전남"],
  ["경상북도", "경북"],
  ["경북", "경북"],
  ["경상남도", "경남"],
  ["경남", "경남"],
  ["제주특별자치도", "제주"],
  ["제주도", "제주"],
  ["제주", "제주"],
];

const SIDO_ALIAS_MAP = new Map<string, (typeof SIDO_LIST)[number]>(
  SIDO_ALIAS_ENTRIES.map(([alias, canonical]) => [normalizeAliasKey(alias), canonical]),
);

const SIDO_SCAN_ALIASES = [...new Set(SIDO_ALIAS_ENTRIES.map(([alias]) => alias))].sort((a, b) => b.length - a.length);
const SIGUNGU_SCAN_ALIASES = Object.values(SIGUNGU_BY_SIDO_CODE_2025)
  .flatMap((entries) => entries.map((entry) => entry.name))
  .sort((a, b) => b.length - a.length);
const SIDO_TO_SIGUNGU_SET = (() => {
  const map = new Map<string, Set<string>>();
  for (const sido of SIDO_ADMIN_2025) {
    const canonicalSido = normalizeSido(sido.name);
    if (!canonicalSido) continue;
    map.set(canonicalSido, new Set((SIGUNGU_BY_SIDO_CODE_2025[sido.code] ?? []).map((entry) => entry.name)));
  }
  return map;
})();

const SIGUNGU_TO_SIDO_SET = (() => {
  const map = new Map<string, Set<string>>();
  for (const sido of SIDO_ADMIN_2025) {
    const canonicalSido = normalizeSido(sido.name);
    if (!canonicalSido) continue;
    for (const sigungu of SIGUNGU_BY_SIDO_CODE_2025[sido.code] ?? []) {
      const set = map.get(sigungu.name) ?? new Set<string>();
      set.add(canonicalSido);
      map.set(sigungu.name, set);
    }
  }
  return map;
})();

const NATIONWIDE_PATTERN = /(전국민|전국\s*공통|전\s*국|전지역|전\s*지역)/;
const SIGUNGU_PATTERN = /([가-힣A-Za-z0-9]{1,20}(?:시|군|구))/;

function normalizeAliasKey(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

export function normalizeSido(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if ((SIDO_LIST as readonly string[]).includes(trimmed)) return trimmed;
  return SIDO_ALIAS_MAP.get(normalizeAliasKey(trimmed)) ?? null;
}

function parseSidoAndSigungu(text: string): { sido: string; sigungu?: string } | null {
  let pickedAlias: string | null = null;
  let pickedIndex = Number.POSITIVE_INFINITY;
  for (const alias of SIDO_SCAN_ALIASES) {
    const idx = text.indexOf(alias);
    if (idx < 0) continue;
    if (idx < pickedIndex) {
      pickedAlias = alias;
      pickedIndex = idx;
      continue;
    }
    if (idx === pickedIndex && pickedAlias && alias.length > pickedAlias.length) {
      pickedAlias = alias;
    }
  }
  if (pickedAlias) {
    const sido = normalizeSido(pickedAlias);
    if (sido) {
      const after = text.slice(pickedIndex + pickedAlias.length).replace(/^[\s,()\-:]+/, "").trim();
      const sigunguMatch = after.match(SIGUNGU_PATTERN);
      const sigungu = sigunguMatch?.[1];
      const allowedSigungu = SIDO_TO_SIGUNGU_SET.get(sido);
      const isKnownSigungu = Boolean(sigungu && allowedSigungu?.has(sigungu));
      return { sido, sigungu: isKnownSigungu ? sigungu : undefined };
    }
  }

  for (const sigungu of SIGUNGU_SCAN_ALIASES) {
    if (!text.includes(sigungu)) continue;
    const mapped = SIGUNGU_TO_SIDO_SET.get(sigungu);
    if (!mapped || mapped.size !== 1) continue;
    const [sido] = [...mapped.values()];
    return { sido, sigungu };
  }

  return null;
}

export function extractRegionTagsFromTexts(texts: string[]): RegionExtracted {
  const cleaned = texts.map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (cleaned.some((text) => NATIONWIDE_PATTERN.test(text))) {
    return { scope: "NATIONWIDE", tags: ["전국"] };
  }

  const tags = new Set<string>();
  let firstSido: string | undefined;
  let firstSigungu: string | undefined;

  for (const text of cleaned) {
    const parsed = parseSidoAndSigungu(text);
    if (!parsed) continue;
    tags.add(parsed.sido);
    if (!firstSido) firstSido = parsed.sido;
    if (parsed.sigungu) {
      tags.add(`${parsed.sido} ${parsed.sigungu}`);
      tags.add(parsed.sigungu);
      if (!firstSigungu) firstSigungu = parsed.sigungu;
    }
  }

  if (tags.size > 0) {
    return {
      scope: "REGIONAL",
      tags: [...tags],
      sido: firstSido,
      sigungu: firstSigungu,
    };
  }

  return { scope: "UNKNOWN", tags: ["미상"] };
}
