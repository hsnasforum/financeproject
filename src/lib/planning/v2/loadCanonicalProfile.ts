import { PlanningV2ValidationError } from "../core/v2/types";
import { validateProfileV2 } from "../core/v2/validate";
import { normalizeAprPct, normalizeNewAprPct } from "../normalizeRates";
import { type ProfileV2 } from "./types";
import { normalizeProfileInput } from "./profileNormalize";
import { validateProfile as validateOfferMapping } from "./profileValidation";
import { PROFILE_SCHEMA_VERSION } from "./schemaVersion";
import {
  buildProfileNormalizationDisclosure,
  type DisclosureFixInput,
  type ProfileNormalizationDisclosure,
} from "./normalizationDisclosure";

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
  normalization: ProfileNormalizationDisclosure;
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

function hasProvidedNumber(value: unknown): boolean {
  return value !== undefined && value !== null && (typeof value === "number" || typeof value === "string");
}

function readSchemaVersion(value: unknown): number {
  if (!isRecord(value)) return 0;
  const raw = Math.trunc(Number(value.schemaVersion));
  if (!Number.isFinite(raw)) return 0;
  return raw;
}

type RawProfileIssue = {
  path: string;
  message: string;
};

function validateRawProfileAnomalies(raw: unknown): RawProfileIssue[] {
  if (!isRecord(raw)) return [];
  const issues: RawProfileIssue[] = [];

  const debts = Array.isArray(raw.debts) ? raw.debts : [];
  debts.forEach((entry, index) => {
    const row = asRecord(entry);
    const aprRaw = row.aprPct ?? row.apr;
    if (hasProvidedNumber(aprRaw)) {
      const aprValue = Number(aprRaw);
      if (!Number.isFinite(aprValue)) {
        issues.push({
          path: `debts[${index}].aprPct`,
          message: "must be a finite number",
        });
      } else if (aprValue < 0 || aprValue > 100) {
        if (!(aprValue > 0 && aprValue <= 1)) {
          issues.push({
            path: `debts[${index}].aprPct`,
            message: "must be 0, legacy decimal (0<x<=1), or percent (1<x<=100)",
          });
        }
      }
    }
  });

  const goals = Array.isArray(raw.goals) ? raw.goals : [];
  goals.forEach((entry, index) => {
    const row = asRecord(entry);
    const target = row.targetAmount;
    const current = row.currentAmount;
    if (target !== undefined) {
      const value = Number(target);
      if (!Number.isFinite(value) || value < 0) {
        issues.push({
          path: `goals[${index}].targetAmount`,
          message: "must be a finite number >= 0",
        });
      }
    }
    if (current !== undefined) {
      const value = Number(current);
      if (!Number.isFinite(value) || value < 0) {
        issues.push({
          path: `goals[${index}].currentAmount`,
          message: "must be a finite number >= 0",
        });
      }
    }
    const targetValue = Number(target);
    const currentValue = Number(current);
    if (Number.isFinite(targetValue) && Number.isFinite(currentValue) && targetValue < currentValue) {
      issues.push({
        path: `goals[${index}]`,
        message: "targetAmount must be >= currentAmount",
      });
    }
  });

  return issues;
}

function normalizeDebtAprPct(
  row: Record<string, unknown>,
  index: number,
): {
  debt: Record<string, unknown>;
  fixes: DisclosureFixInput[];
} {
  const aprPctRaw = asNumber(row.aprPct);
  const aprRaw = asNumber(row.apr);
  const next = { ...row };
  const fixes: DisclosureFixInput[] = [];

  if (aprPctRaw !== undefined) {
    try {
      const normalized = normalizeAprPct(aprPctRaw, "debts[].aprPct");
      next.aprPct = normalized;
      if (normalized !== aprPctRaw) {
        fixes.push({
          path: `debts[${index}].aprPct`,
          from: aprPctRaw,
          to: normalized,
          message: "APR 입력값을 퍼센트 단위로 보정했습니다.",
        });
      }
    } catch {
      next.aprPct = aprPctRaw;
    }
  } else if (aprRaw !== undefined) {
    try {
      const normalized = normalizeAprPct(aprRaw, "debts[].apr");
      next.aprPct = normalized;
      fixes.push({
        path: `debts[${index}].aprPct`,
        from: aprRaw,
        to: normalized,
        message: "legacy apr 값을 aprPct(퍼센트)로 정규화했습니다.",
      });
    } catch {
      next.aprPct = aprRaw;
    }
  }

  if ("apr" in next) {
    delete next.apr;
  }

  return { debt: next, fixes };
}

function migrateProfilePayload(raw: unknown): {
  schemaVersion: 2;
  migratedFrom?: number;
  payload: unknown;
  fixesApplied: DisclosureFixInput[];
} {
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

  const debtRows = asArray(source.debts).map((entry, index) => normalizeDebtAprPct(asRecord(entry), index));
  const debts = debtRows.map((entry) => entry.debt);
  const fixesApplied = debtRows.flatMap((entry) => entry.fixes);

  const payload = {
    ...source,
    debts,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  };

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    ...(typeof migratedFrom === "number" ? { migratedFrom } : {}),
    payload,
    fixesApplied,
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
  const rawIssues = validateRawProfileAnomalies(raw);
  if (rawIssues.length > 0) {
    throw new PlanningV2ValidationError("Invalid profile input", rawIssues);
  }

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
  const normalization = buildProfileNormalizationDisclosure(
    normalized,
    normalized.profile,
    migrated.fixesApplied,
  );

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
    normalization,
  };
}

export function migrateProfile(raw: unknown): ProfileV2 {
  return loadCanonicalProfile(raw).profile;
}
