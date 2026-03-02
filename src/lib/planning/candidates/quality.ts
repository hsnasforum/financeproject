import { z } from "zod";
import { type FinlifeSnapshot, type FinlifeSnapshotKind } from "../../finlife/snapshot";

export const CandidateVMSchema = z.object({
  providerName: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  termMonths: z.number().int().gt(0),
  baseRatePct: z.number().finite().min(0).max(100),
  primeRatePct: z.number().finite().min(0).max(100).optional(),
  fetchedAt: z.string().trim().refine((value) => Number.isFinite(Date.parse(value)), {
    message: "must be a valid ISO datetime",
  }).optional(),
});

export type CandidateVM = z.infer<typeof CandidateVMSchema>;

export type CandidateQualityReasonCode =
  | "SCHEMA_INVALID"
  | "MISSING_REQUIRED"
  | "DUPLICATE_KEY"
  | "RATE_ANOMALY"
  | "TERM_ANOMALY";

export type CandidateQualitySample = {
  providerName: string;
  productName: string;
  termMonths: number;
  baseRatePct: number;
  reasonCodes: CandidateQualityReasonCode[];
};

export type FinlifeQualityStatus = "OK" | "WARN" | "RISK";

export type FinlifeQualityReport = {
  kind: FinlifeSnapshotKind;
  counts: {
    total: number;
    valid: number;
    invalidSchema: number;
    duplicates: number;
    rateAnomalies: number;
    termAnomalies: number;
  };
  status: FinlifeQualityStatus;
  samples: CandidateQualitySample[];
};

type CheckFinlifeQualityOptions = {
  duplicateWarnThreshold?: number;
  sampleLimit?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toTermMonths(value: unknown): number {
  const raw = asString(value);
  if (!raw) return 0;
  const digits = raw.match(/\d+/g)?.join("") ?? "";
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

function pushSample(
  target: CandidateQualitySample[],
  sample: Omit<CandidateQualitySample, "reasonCodes"> & { reasonCodes: Set<CandidateQualityReasonCode> },
  limit: number,
): void {
  if (target.length >= limit) return;
  target.push({
    providerName: sample.providerName.slice(0, 80),
    productName: sample.productName.slice(0, 80),
    termMonths: sample.termMonths,
    baseRatePct: sample.baseRatePct,
    reasonCodes: Array.from(sample.reasonCodes),
  });
}

function normalizeSchemaReasonCodes(raw: z.ZodIssue[]): CandidateQualityReasonCode[] {
  const out = new Set<CandidateQualityReasonCode>();
  for (const issue of raw) {
    const path = issue.path.join(".");
    if (path === "providerName" || path === "productName") {
      out.add("MISSING_REQUIRED");
      continue;
    }
    if (path === "termMonths") {
      out.add("TERM_ANOMALY");
      continue;
    }
    if (path === "baseRatePct" || path === "primeRatePct") {
      out.add("RATE_ANOMALY");
      continue;
    }
    out.add("SCHEMA_INVALID");
  }
  return Array.from(out);
}

export function normalizeFinlifeSnapshotToCandidates(snapshot: FinlifeSnapshot | null): CandidateVM[] {
  if (!snapshot) return [];
  const fetchedAt = asString(snapshot.meta?.generatedAt);
  const rows: CandidateVM[] = [];

  for (const product of snapshot.items) {
    const providerName = asString(product.kor_co_nm);
    const productName = asString(product.fin_prdt_nm);
    const options = Array.isArray(product.options) && product.options.length > 0
      ? product.options
      : [{ save_trm: "", intr_rate: Number.NaN, intr_rate2: undefined, raw: {} }];

    for (const option of options) {
      const row = {
        providerName,
        productName,
        termMonths: toTermMonths(option.save_trm),
        baseRatePct: asNumber(option.intr_rate),
        ...(option.intr_rate2 === null || option.intr_rate2 === undefined
          ? {}
          : { primeRatePct: asNumber(option.intr_rate2) }),
        ...(fetchedAt ? { fetchedAt } : {}),
      } satisfies CandidateVM;
      rows.push(row);
    }
  }

  return rows;
}

export function checkFinlifeQuality(
  kind: FinlifeSnapshotKind,
  candidates: CandidateVM[],
  options?: CheckFinlifeQualityOptions,
): FinlifeQualityReport {
  const sampleLimit = Math.max(1, options?.sampleLimit ?? 5);
  const duplicateWarnThreshold = Math.max(0, options?.duplicateWarnThreshold ?? 5);
  const keyCount = new Map<string, number>();
  const samples: CandidateQualitySample[] = [];

  let valid = 0;
  let invalidSchema = 0;
  let duplicates = 0;
  let rateAnomalies = 0;
  let termAnomalies = 0;

  for (const candidate of candidates) {
    const reasonCodes = new Set<CandidateQualityReasonCode>();
    const schemaParsed = CandidateVMSchema.safeParse(candidate);

    if (!schemaParsed.success) {
      invalidSchema += 1;
      for (const code of normalizeSchemaReasonCodes(schemaParsed.error.issues)) {
        reasonCodes.add(code);
      }
    }

    const hasTermAnomaly = !Number.isFinite(candidate.termMonths) || candidate.termMonths <= 0;
    if (hasTermAnomaly) {
      termAnomalies += 1;
      reasonCodes.add("TERM_ANOMALY");
    }

    const hasBaseRateAnomaly = !Number.isFinite(candidate.baseRatePct) || candidate.baseRatePct < 0 || candidate.baseRatePct > 100;
    const hasPrimeRateAnomaly = candidate.primeRatePct !== undefined
      && (!Number.isFinite(candidate.primeRatePct) || candidate.primeRatePct < 0 || candidate.primeRatePct > 100);
    if (hasBaseRateAnomaly || hasPrimeRateAnomaly) {
      rateAnomalies += 1;
      reasonCodes.add("RATE_ANOMALY");
    }

    if (!hasTermAnomaly) {
      const key = `${candidate.providerName}|${candidate.productName}|${candidate.termMonths}`;
      const count = (keyCount.get(key) ?? 0) + 1;
      keyCount.set(key, count);
      if (count > 1) {
        duplicates += 1;
        reasonCodes.add("DUPLICATE_KEY");
      }
    }

    if (reasonCodes.size < 1 && schemaParsed.success) {
      valid += 1;
    } else {
      pushSample(samples, {
        providerName: asString(candidate.providerName),
        productName: asString(candidate.productName),
        termMonths: Number.isFinite(candidate.termMonths) ? Math.trunc(candidate.termMonths) : 0,
        baseRatePct: Number.isFinite(candidate.baseRatePct) ? candidate.baseRatePct : Number.NaN,
        reasonCodes,
      }, sampleLimit);
    }
  }

  const status: FinlifeQualityStatus = (invalidSchema > 0 || rateAnomalies > 0 || termAnomalies > 0)
    ? "RISK"
    : duplicates > duplicateWarnThreshold
      ? "WARN"
      : "OK";

  return {
    kind,
    counts: {
      total: candidates.length,
      valid,
      invalidSchema,
      duplicates,
      rateAnomalies,
      termAnomalies,
    },
    status,
    samples,
  };
}
