import { normalizeSido } from "../regions/kr";

const MAJOR_REGIONS = [
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

const REGION_ALIASES: Record<(typeof MAJOR_REGIONS)[number], string[]> = {
  서울: ["서울", "서울시", "서울특별시"],
  부산: ["부산", "부산시", "부산광역시"],
  대구: ["대구", "대구시", "대구광역시"],
  인천: ["인천", "인천시", "인천광역시"],
  광주: ["광주", "광주시", "광주광역시"],
  대전: ["대전", "대전시", "대전광역시"],
  울산: ["울산", "울산시", "울산광역시"],
  세종: ["세종", "세종시", "세종특별자치시"],
  경기: ["경기", "경기도"],
  강원: ["강원", "강원도", "강원특별자치도"],
  충북: ["충북", "충청북도"],
  충남: ["충남", "충청남도"],
  전북: ["전북", "전라북도", "전북특별자치도"],
  전남: ["전남", "전라남도"],
  경북: ["경북", "경상북도"],
  경남: ["경남", "경상남도"],
  제주: ["제주", "제주도", "제주특별자치도"],
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function normalizeSigungu(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function findMajorRegionsFromText(text: string): string[] {
  const compact = normalizeText(text);
  if (!compact) return [];
  const hit = new Set<string>();
  for (const major of MAJOR_REGIONS) {
    const aliases = REGION_ALIASES[major];
    if (aliases.some((alias) => compact.includes(normalizeText(alias)))) {
      hit.add(major);
    }
  }
  return [...hit];
}

function inferItemSido(params: {
  itemSido?: string | null;
  itemRegionTags?: string[];
  title?: string;
  orgName?: string;
}): string | null {
  const normalizedSido = normalizeSido(params.itemSido?.trim() ?? "");
  if (normalizedSido) return normalizedSido;
  const inferred = extractBenefitMajorRegions({
    regionTags: params.itemRegionTags,
    title: params.title,
    orgName: params.orgName,
  });
  return inferred[0] ?? null;
}

function inferLocalFromOrgType(orgType?: string | null): boolean {
  return (orgType ?? "").trim() === "local";
}

export function extractUserMajorRegions(query: string): string[] {
  return findMajorRegionsFromText(query);
}

export function extractBenefitMajorRegions(params: {
  regionTags?: string[];
  title?: string;
  orgName?: string;
  sido?: string;
}): string[] {
  const result = new Set<string>();
  const normalizedSido = normalizeSido(params.sido?.trim() ?? "");
  if (normalizedSido) result.add(normalizedSido);

  for (const text of [
    ...(params.regionTags ?? []),
    params.title ?? "",
    params.orgName ?? "",
  ]) {
    for (const major of findMajorRegionsFromText(text)) {
      result.add(major);
    }
  }
  return [...result];
}

export function isRegionMatch(opts: {
  query?: string;
  selectedSido?: string | null;
  selectedSigungu?: string | null;
  itemRegionScope?: "NATIONWIDE" | "REGIONAL" | "UNKNOWN";
  itemRegionTags?: string[];
  itemSido?: string | null;
  itemSigungu?: string | null;
  title?: string;
  orgName?: string;
  orgType?: string | null;
}): boolean {
  const selectedSido = normalizeSido(opts.selectedSido?.trim() ?? "");
  const selectedSigungu = (opts.selectedSigungu ?? "").trim();
  const scope = opts.itemRegionScope ?? "UNKNOWN";

  if (selectedSido) {
    if (scope === "NATIONWIDE") return true;

    const inferredSido = inferItemSido({
      itemSido: opts.itemSido,
      itemRegionTags: opts.itemRegionTags,
      title: opts.title,
      orgName: opts.orgName,
    });

    if (scope === "REGIONAL") {
      if (!inferredSido || inferredSido !== selectedSido) return false;
      if (!selectedSigungu) return true;
      const itemSigungu = (opts.itemSigungu ?? "").trim();
      if (!itemSigungu) return true;
      return normalizeSigungu(itemSigungu) === normalizeSigungu(selectedSigungu);
    }

    if (inferLocalFromOrgType(opts.orgType)) {
      if (!inferredSido) return false;
      if (inferredSido !== selectedSido) return false;
      if (!selectedSigungu) return true;
      const itemSigungu = (opts.itemSigungu ?? "").trim();
      if (!itemSigungu) return true;
      return normalizeSigungu(itemSigungu) === normalizeSigungu(selectedSigungu);
    }

    return true;
  }

  const userRegions = extractUserMajorRegions(opts.query ?? "");
  if (userRegions.length === 0) return true;
  if (scope === "NATIONWIDE") return true;

  const benefitRegions = extractBenefitMajorRegions({
    regionTags: opts.itemRegionTags,
    title: opts.title,
    orgName: opts.orgName,
    sido: opts.itemSido ?? undefined,
  });

  if (scope === "UNKNOWN" && inferLocalFromOrgType(opts.orgType) && benefitRegions.length === 0) {
    return false;
  }

  if (benefitRegions.length === 0) return true;
  return benefitRegions.some((region) => userRegions.includes(region));
}
