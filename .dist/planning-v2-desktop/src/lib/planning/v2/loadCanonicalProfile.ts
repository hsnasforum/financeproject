import { PlanningV2ValidationError } from "../core/v2/types";
import { validateProfileV2 } from "../core/v2/validate";
import { normalizeAprPct, normalizeNewAprPct } from "../normalizeRates";
import { type ProfileV2 } from "./types";
import { normalizeProfileInput } from "./profileNormalize";
import { validateProfile as validateOfferMapping } from "./profileValidation";
import { PROFILE_SCHEMA_VERSION } from "./schemaVersion";

type CanonicalOfferInput = {
  liabilityId?: unknown;
  newAprPct?: unknown;
  newApr?: unknown;
};

export type CanonicalProfileLoadOptions = {
  offers?: CanonicalOfferInput[];
};

export type CanonicalProfileLoadResult = {
  schemaVersion: 2;
  migratedFrom?: number;
  profile: ProfileV2;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSchemaVersion(value: unknown): number {
  if (!isRecord(value)) return 0;
  const raw = Math.trunc(Number(value.schemaVersion));
  if (!Number.isFinite(raw)) return 0;
  return raw;
}

function normalizeDebtAprPct(row: Record<string, unknown>): Record<string, unknown> {
  const aprPctRaw = asNumber(row.aprPct);
  const aprRaw = asNumber(row.apr);
  const next = { ...row };

  if (aprPctRaw !== undefined) {
    try {
      next.aprPct = normalizeAprPct(aprPctRaw, "debts[].aprPct");
    } catch {
      next.aprPct = aprPctRaw;
    }
  } else if (aprRaw !== undefined) {
    try {
      next.aprPct = normalizeAprPct(aprRaw, "debts[].apr");
    } catch {
      next.aprPct = aprRaw;
    }
  }

  if ("apr" in next) {
    delete next.apr;
  }

  return next;
}

function migrateProfilePayload(raw: unknown): { schemaVersion: 2; migratedFrom?: number; payload: unknown } {
  if (!isRecord(raw)) {
    throw new PlanningV2ValidationError("Invalid profile input", [
      { path: "profile", message: "must be an object" },
    ]);
  }

  const schemaVersion = readSchemaVersion(raw);
  if (schemaVersion > PROFILE_SCHEMA_VERSION) {
    throw new PlanningV2ValidationError("Invalid profile input", [
      {
        path: "profile.schemaVersion",
        message: `unsupported schemaVersion=${schemaVersion} (latest=${PROFILE_SCHEMA_VERSION})`,
      },
    ]);
  }

  const source = { ...raw };
  const migratedFrom = schemaVersion > 0 && schemaVersion < PROFILE_SCHEMA_VERSION
    ? schemaVersion
    : (schemaVersion === 0 ? 1 : undefined);

  const debts = asArray(source.debts).map((entry) => normalizeDebtAprPct(asRecord(entry)));

  const payload = {
    ...source,
    debts,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  };

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    ...(typeof migratedFrom === "number" ? { migratedFrom } : {}),
    payload,
  };
}

function normalizeOffersForValidation(offers: CanonicalOfferInput[]): {
  offers: Array<{ liabilityId: string; newAprPct: number }>;
  issues: Array<{ path: string; message: string }>;
} {
  const normalized: Array<{ liabilityId: string; newAprPct: number }> = [];
  const issues: Array<{ path: string; message: string }> = [];

  offers.forEach((offer, index) => {
    const path = `offers[${index}]`;
    const liabilityId = asString(offer.liabilityId);
    if (!liabilityId) {
      issues.push({
        path: `${path}.liabilityId`,
        message: "must be a non-empty string",
      });
      return;
    }

    const rawApr = asNumber(offer.newAprPct) ?? asNumber(offer.newApr);
    if (rawApr === undefined) {
      issues.push({
        path: `${path}.newAprPct`,
        message: "must be a finite number",
      });
      return;
    }

    try {
      normalized.push({
        liabilityId,
        newAprPct: normalizeNewAprPct(rawApr, `${path}.newAprPct`),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid APR";
      issues.push({
        path: `${path}.newAprPct`,
        message,
      });
    }
  });

  return {
    offers: normalized,
    issues,
  };
}

function extractOffersFromLegacyPayload(raw: unknown): CanonicalOfferInput[] {
  const row = asRecord(raw);
  if (Array.isArray(row.offers)) return row.offers as CanonicalOfferInput[];
  if (Array.isArray(row.debtOffers)) return row.debtOffers as CanonicalOfferInput[];

  const debtStrategy = asRecord(row.debtStrategy);
  if (Array.isArray(debtStrategy.offers)) return debtStrategy.offers as CanonicalOfferInput[];

  return [];
}

export function loadCanonicalProfile(raw: unknown, options?: CanonicalProfileLoadOptions): CanonicalProfileLoadResult {
  const migrated = migrateProfilePayload(raw);
  const normalized = normalizeProfileInput(migrated.payload);
  if (!normalized.ok) {
    throw new PlanningV2ValidationError("Invalid profile input", [
      {
        path: "profile",
        message: normalized.warnings.join(", ") || "normalize failed",
      },
    ]);
  }

  // validate shape/ranges, but keep normalized profile as canonical storage payload.
  validateProfileV2(normalized.profile);

  const rawOffers = options?.offers ?? extractOffersFromLegacyPayload(raw);
  if (rawOffers.length > 0) {
    const mapped = normalizeOffersForValidation(rawOffers);
    if (mapped.issues.length > 0) {
      throw new PlanningV2ValidationError("Invalid profile input", mapped.issues);
    }

    const mappingIssues = validateOfferMapping(normalized.profile, { offers: mapped.offers });
    if (mappingIssues.length > 0) {
      throw new PlanningV2ValidationError(
        "Invalid profile input",
        mappingIssues.map((issue) => ({ path: issue.path, message: issue.message })),
      );
    }
  }

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    ...(typeof migrated.migratedFrom === "number" ? { migratedFrom: migrated.migratedFrom } : {}),
    profile: normalized.profile,
  };
}

export function migrateProfile(raw: unknown): ProfileV2 {
  return loadCanonicalProfile(raw).profile;
}
