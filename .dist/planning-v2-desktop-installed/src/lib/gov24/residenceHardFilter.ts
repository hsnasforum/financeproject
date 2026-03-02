import { type BenefitCandidate } from "../publicApis/contracts/types";
import { classifyOrgType } from "./orgClassifier";
import { extractRegionTagsFromTexts, normalizeSido, type RegionScope } from "../regions/kr";
import { extractBenefitMajorRegions } from "./regionFilter";

const NATIONWIDE_HINT_PATTERN = /(전국민|전국\s*공통|전\s*국|전지역|전\s*지역)/;
const SIGUNGU_TOKEN_PATTERN = /([가-힣A-Za-z0-9]{1,20}(?:시|군|구))/g;

function normalizeSigungu(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function extractSigunguFromOrg(orgName: string): string | null {
  const text = orgName.replace(/\s+/g, " ").trim();
  if (!text) return null;

  let found: string | null = null;
  for (const match of text.matchAll(SIGUNGU_TOKEN_PATTERN)) {
    const token = match[1]?.trim();
    if (!token) continue;
    if (/(광역시|특별시|특별자치시)$/.test(token)) continue;
    found = token;
  }

  return found;
}

function inferItemRegion(item: BenefitCandidate): { scope: RegionScope; sido?: string; sigungu?: string } {
  const orgType = classifyOrgType(item.org);
  const texts = [item.org ?? "", item.title ?? "", item.summary ?? "", ...(item.eligibilityHints ?? [])];

  const baseScope = item.region.scope;
  const baseSido = normalizeSido(item.region.sido?.trim() ?? "") ?? undefined;
  const baseSigungu = normalizeSigungu(item.region.sigungu ?? "") || undefined;
  const orgSigungu = extractSigunguFromOrg(item.org ?? "") ?? undefined;

  // 1) Explicit region fields are strongest and should not be overridden by wording.
  if (baseSido) {
    return { scope: "REGIONAL", sido: baseSido, sigungu: baseSigungu ?? orgSigungu };
  }

  // 2) Infer major region from organization/title/summary text.
  const regionHints = extractBenefitMajorRegions({
    regionTags: [...(item.region.tags ?? []), ...texts],
    title: item.title,
    orgName: item.org,
    sido: item.region.sido,
  });
  const hintedSido = regionHints[0] ?? undefined;
  if (hintedSido) {
    return { scope: "REGIONAL", sido: hintedSido, sigungu: baseSigungu ?? orgSigungu };
  }

  const extracted = extractRegionTagsFromTexts([item.org ?? "", item.title ?? "", item.summary ?? ""]);
  const extractedSido = normalizeSido(extracted.sido?.trim() ?? "") ?? undefined;
  const extractedSigungu = normalizeSigungu(extracted.sigungu ?? "") || undefined;
  if (extractedSido) {
    return { scope: "REGIONAL", sido: extractedSido, sigungu: baseSigungu ?? orgSigungu ?? extractedSigungu };
  }

  // 3) Local org should never be promoted to nationwide by keyword only.
  if (orgType === "local") {
    return { scope: "UNKNOWN", sigungu: baseSigungu ?? orgSigungu };
  }

  // 4) Nationwide only for central/public and no regional hint.
  const hasNationwideHint = texts.some((text) => NATIONWIDE_HINT_PATTERN.test(text));
  if ((orgType === "central" || orgType === "public") && hasNationwideHint) {
    return { scope: "NATIONWIDE" };
  }

  if (baseScope === "NATIONWIDE") {
    return { scope: "NATIONWIDE" };
  }

  return { scope: "UNKNOWN", sigungu: baseSigungu ?? orgSigungu };
}

export function filterByResidence(
  items: BenefitCandidate[],
  residence: { sido: string; sigungu: string },
): BenefitCandidate[] {
  const residenceSido = normalizeSido(residence.sido.trim());
  const residenceSigungu = normalizeSigungu(residence.sigungu ?? "");
  if (!residenceSido) return items;

  return items.filter((item) => {
    const orgType = classifyOrgType(item.org);
    const inferred = inferItemRegion(item);

    if (inferred.scope === "NATIONWIDE") {
      // Local org should not bypass residence filter through nationwide wording.
      if (orgType === "local") return false;
      return true;
    }

    if (inferred.scope === "REGIONAL") {
      if (inferred.sido !== residenceSido) return false;
      if (!residenceSigungu) return true;

      const itemSigungu = normalizeSigungu(inferred.sigungu ?? "");
      if (itemSigungu) {
        return itemSigungu === residenceSigungu;
      }

      // Only allow broad province-level programs when org text truly has no sigungu token.
      return extractSigunguFromOrg(item.org ?? "") === null;
    }

    if (orgType === "central") return true;
    if (orgType === "local") return false;

    const nationwideHints = [item.title, item.summary, ...(item.eligibilityHints ?? [])].filter(
      (text): text is string => typeof text === "string",
    );
    return nationwideHints.some((text) => NATIONWIDE_HINT_PATTERN.test(text));
  });
}
