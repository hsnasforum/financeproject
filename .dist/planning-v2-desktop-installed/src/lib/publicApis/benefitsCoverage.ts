import { getBenefitQualityBucket } from "./benefitsQuality";
import { type BenefitCandidate } from "./contracts/types";

type CoverageRates = {
  summary: number;
  org: number;
  applyHow: number;
  eligibilityText: number;
  contact: number;
  link: number;
  region: number;
};

export type BenefitsCoverageReport = {
  totalItems: number;
  fieldsCoverage: CoverageRates;
  lengthStats: { eligibilityP50: number; eligibilityP90: number };
  qualityBuckets: Record<"HIGH" | "MED" | "LOW" | "EMPTY", number>;
};

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

export function buildBenefitsCoverage(items: BenefitCandidate[]): BenefitsCoverageReport {
  const total = items.length;
  const summary = items.filter((item) => Boolean((item.summary ?? "").trim())).length;
  const org = items.filter((item) => Boolean((item.org ?? "").trim())).length;
  const applyHow = items.filter((item) => Boolean((item.applyHow ?? "").trim())).length;
  const eligibilityText = items.filter((item) => Boolean((item.eligibilityText ?? item.eligibilityExcerpt ?? "").trim())).length;
  const contact = items.filter((item) => Boolean((item.contact ?? "").trim())).length;
  const link = items.filter((item) => Boolean((item.link ?? "").trim())).length;
  const region = items.filter((item) => item.region.scope !== "UNKNOWN").length;

  const lengths = items
    .map((item) => (item.eligibilityText ?? item.eligibilityExcerpt ?? "").replace(/\s+/g, " ").trim().length)
    .filter((len) => len > 0)
    .sort((a, b) => a - b);

  const qualityBuckets: Record<"HIGH" | "MED" | "LOW" | "EMPTY", number> = {
    HIGH: 0,
    MED: 0,
    LOW: 0,
    EMPTY: 0,
  };
  for (const item of items) {
    qualityBuckets[getBenefitQualityBucket(item)] += 1;
  }

  return {
    totalItems: total,
    fieldsCoverage: {
      summary: rate(summary, total),
      org: rate(org, total),
      applyHow: rate(applyHow, total),
      eligibilityText: rate(eligibilityText, total),
      contact: rate(contact, total),
      link: rate(link, total),
      region: rate(region, total),
    },
    lengthStats: {
      eligibilityP50: percentile(lengths, 50),
      eligibilityP90: percentile(lengths, 90),
    },
    qualityBuckets,
  };
}
