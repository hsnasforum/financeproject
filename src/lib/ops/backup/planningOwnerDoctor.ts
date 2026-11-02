import { constants, type BigIntStats, type Dir } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { isTxnId } from "../../planning/v3/service/txnId";
import { isPlanningEncryptedEnvelope } from "../../planning/crypto/encrypt";
import { isVaultEncryptedEnvelope } from "../../planning/crypto/vaultCrypto";
import { AlertEventSchema, AlertRuleOverridesSchema } from "../../planning/v3/alerts/contracts";
import { DraftRecordSchema } from "../../planning/v3/drafts/draftSchema";
import { ExposureProfileSchema } from "../../planning/v3/exposure/contracts";
import {
  IndicatorsStateSchema,
  ObservationSchema,
  SeriesSnapshotMetaSchema,
  SeriesSpecSchema,
} from "../../planning/v3/indicators/contracts";
import { JournalEntrySchema } from "../../planning/v3/journal/contracts";
import {
  DailyDigestSchema,
  NewsItemSchema,
  NewsNoteSchema,
  NewsSettingsSchema,
  RuntimeStateSchema,
  TopicDailyStatSchema,
} from "../../planning/v3/news/contracts";
import {
  ScenariosCacheSchema,
  TodayCacheSchema,
  TrendsCacheSchema,
} from "../../planning/v3/news/store/index";
import { WeeklyPlanSchema } from "../../planning/v3/news/weeklyPlan";
import { DailyRoutineChecklistSchema } from "../../planning/v3/routines/contracts";
import { ScenarioLibraryOverridesSchema } from "../../planning/v3/scenarios/library";
import {
  PLANNING_DATA_OWNER_IDS,
  normalizePlanningOwnerLogicalPath,
  resolvePlanningDataOwners,
  type PlanningArchiveContext,
  type PlanningDataOwnerId,
  type PlanningOwnerLocation,
  type PlanningOwnerNamespace,
  type ResolvedPlanningDataOwner,
} from "./planningOwnerRegistry";

const MAX_ENTRIES = 10_000;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const SHA256_RE = /^[a-f0-9]{8,128}$/u;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export type PlanningOwnerDoctorIssueLevel = "error" | "warning";

export type PlanningOwnerDoctorIssueCode =
  | "OWNER_DOCTOR_REQUIRED_OWNER_MISSING"
  | "OWNER_DOCTOR_OWNER_UNKNOWN"
  | "OWNER_DOCTOR_NAMESPACE_MISMATCH"
  | "OWNER_DOCTOR_CONTRACT_MISMATCH"
  | "OWNER_DOCTOR_EMPTY_NOT_ALLOWED"
  | "OWNER_DOCTOR_LOCATION_KIND_MISMATCH"
  | "OWNER_DOCTOR_LINK_NOT_ALLOWED"
  | "OWNER_DOCTOR_SPECIAL_FILE_NOT_ALLOWED"
  | "OWNER_DOCTOR_REALPATH_ESCAPE"
  | "OWNER_DOCTOR_SOURCE_ALIAS_NOT_ALLOWED"
  | "OWNER_DOCTOR_SOURCE_CHANGED"
  | "OWNER_DOCTOR_READ_FAILED"
  | "OWNER_DOCTOR_UTF8_INVALID"
  | "OWNER_DOCTOR_JSON_INVALID"
  | "OWNER_DOCTOR_NDJSON_INVALID"
  | "OWNER_DOCTOR_SCHEMA_INVALID"
  | "OWNER_DOCTOR_SCHEMA_VALIDATOR_MISSING"
  | "OWNER_DOCTOR_ENCRYPTED_PAYLOAD_UNVERIFIED"
  | "OWNER_DOCTOR_ENCRYPTED_PAYLOAD_INVALID"
  | "OWNER_DOCTOR_LOGICAL_PATH_INVALID"
  | "OWNER_DOCTOR_LIMIT_EXCEEDED";

export type PlanningOwnerDoctorIssue = Readonly<{
  level: PlanningOwnerDoctorIssueLevel;
  check: string;
  path: string;
  code: PlanningOwnerDoctorIssueCode;
  message: string;
}>;

export type PlanningOwnerDoctorSummary = Readonly<{
  check: PlanningDataOwnerId;
  files: number;
  errors: number;
  warnings: number;
  locations: number;
  missingLocations: number;
  emptyLocations: number;
}>;

export type PlanningOwnerDoctorReport = Readonly<{
  ok: boolean;
  checkedAt: string;
  counts: Readonly<{
    checks: number;
    files: number;
    errors: number;
    warnings: number;
  }>;
  summaries: readonly PlanningOwnerDoctorSummary[];
  issues: readonly PlanningOwnerDoctorIssue[];
}>;

export type RunPlanningOwnerDoctorInput = Readonly<{
  context: PlanningArchiveContext;
  owners?: readonly ResolvedPlanningDataOwner[];
  checkedAt?: string | Date;
}>;

export type ValidatePlanningOwnerPayloadFileInput = Readonly<{
  ownerId: PlanningDataOwnerId;
  logicalPath: string;
  bytes: Uint8Array;
}>;

export class PlanningOwnerDoctorValidationError extends Error {
  readonly code: PlanningOwnerDoctorIssueCode;
  readonly ownerId: PlanningDataOwnerId;
  readonly logicalPath: string;

  constructor(
    code: PlanningOwnerDoctorIssueCode,
    ownerId: PlanningDataOwnerId,
    logicalPath: string,
    detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "PlanningOwnerDoctorValidationError";
    this.code = code;
    this.ownerId = ownerId;
    this.logicalPath = logicalPath;
  }
}

type PayloadValidationContext = Readonly<{
  ownerId: PlanningDataOwnerId;
  logicalPath: string;
  bytes: Uint8Array;
}>;

type PlanningOwnerPayloadValidator = (input: PayloadValidationContext) => void;

type MutableSummary = {
  check: PlanningDataOwnerId;
  files: number;
  errors: number;
  warnings: number;
  locations: number;
  missingLocations: number;
  emptyLocations: number;
};

type InspectionBudget = {
  entries: number;
  totalBytes: number;
};

type SourceIdentityState = {
  realPaths: Set<string>;
  inodes: Set<string>;
};

const SafeIdSchema = z.string().regex(SAFE_ID_RE);
const IsoLikeSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const JsonRecordSchema = z.record(z.string(), z.unknown());
const TxnIdSchema = z.string().refine((value) => value === value.trim() && isTxnId(value));
const CategoryIdSchema = z.enum([
  "income",
  "transfer",
  "fixed",
  "variable",
  "debt",
  "tax",
  "insurance",
  "housing",
  "food",
  "transport",
  "shopping",
  "health",
  "education",
  "etc",
  "unknown",
]);

const StableProfileRecordSchema = z.object({
  version: z.literal(1),
  schemaVersion: z.number().int().min(1).max(2).optional(),
  id: SafeIdSchema,
  name: z.string().trim().min(1),
  profile: JsonRecordSchema,
  createdAt: IsoLikeSchema,
  updatedAt: IsoLikeSchema,
}).passthrough();

const StableProfileRegistrySchema = z.object({
  version: z.literal(1),
  defaultProfileId: SafeIdSchema.optional(),
  profiles: z.array(z.object({
    profileId: SafeIdSchema,
    name: z.string().trim().min(1),
    createdAt: IsoLikeSchema,
    updatedAt: IsoLikeSchema,
  }).strict()),
}).strict();

const StableProfileMetaSchema = z.object({
  version: z.literal(1),
  defaultProfileId: SafeIdSchema.optional(),
}).strict();

const StableRunRecordSchema = z.object({
  version: z.literal(1),
  schemaVersion: z.number().int().min(1).max(2).optional(),
  id: SafeIdSchema,
  profileId: SafeIdSchema,
  createdAt: IsoLikeSchema,
  input: JsonRecordSchema,
  meta: JsonRecordSchema,
  outputs: JsonRecordSchema,
}).passthrough();

const StableRunIndexSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.object({
    id: SafeIdSchema,
    profileId: SafeIdSchema,
    createdAt: IsoLikeSchema,
  }).passthrough()),
}).strict();

const StableActionPlanSchema = z.object({
  version: z.literal(1),
  runId: SafeIdSchema,
  generatedAt: IsoLikeSchema,
  items: z.array(z.object({
    actionKey: z.string().trim().min(1),
    title: z.string(),
    description: z.string(),
    steps: z.array(z.string()),
  }).passthrough()),
}).strict();

const StableActionProgressSchema = z.object({
  version: z.literal(1),
  runId: SafeIdSchema,
  updatedAt: IsoLikeSchema,
  items: z.array(z.object({
    actionKey: z.string().trim().min(1),
    status: z.enum(["todo", "doing", "done", "snoozed"]),
    updatedAt: IsoLikeSchema,
  }).passthrough()),
}).strict();

const CashflowDraftSchema = z.object({
  id: SafeIdSchema,
  createdAt: IsoLikeSchema,
  source: z.object({
    kind: z.literal("csv"),
    filename: z.string().optional(),
    rows: z.number().int().nonnegative().optional(),
    months: z.number().int().nonnegative().optional(),
  }).strict(),
  cashflow: z.array(z.object({
    ym: z.string().regex(/^\d{4}-\d{2}$/u),
    incomeKrw: z.number().finite(),
    expenseKrw: z.number().finite(),
    netKrw: z.number().finite(),
    txCount: z.number().int().nonnegative().optional(),
  }).strict()),
  draftPatch: JsonRecordSchema,
  summary: JsonRecordSchema,
}).strict();

const ProfileDraftSchema = z.object({
  id: SafeIdSchema,
  batchId: SafeIdSchema,
  createdAt: IsoLikeSchema,
  draftPatch: JsonRecordSchema,
  evidence: JsonRecordSchema,
  assumptions: z.array(z.string()),
  stats: z.object({
    months: z.number().int().nonnegative(),
    transfersExcluded: z.literal(true).optional(),
    unassignedCount: z.number().int().nonnegative().optional(),
  }).strict().optional(),
}).strict();

const TxnOverrideRowSchema = z.object({
  batchId: SafeIdSchema,
  txnId: TxnIdSchema,
  kind: z.enum(["income", "expense", "transfer"]).optional(),
  category: z.union([CategoryIdSchema, z.enum(["saving", "invest"])]).optional(),
  categoryId: CategoryIdSchema.optional(),
  updatedAt: IsoLikeSchema,
  note: z.string().optional(),
}).strict().refine((row) => Boolean(row.kind || row.category || row.categoryId));

const TxnTransferOverrideRowSchema = z.object({
  batchId: SafeIdSchema,
  txnId: TxnIdSchema,
  forceTransfer: z.literal(true).optional(),
  forceNonTransfer: z.literal(true).optional(),
  updatedAt: IsoLikeSchema,
  note: z.string().optional(),
}).strict().refine((row) => row.forceTransfer === true !== (row.forceNonTransfer === true));

const TxnAccountOverrideRowSchema = z.object({
  batchId: SafeIdSchema,
  txnId: TxnIdSchema,
  accountId: z.union([SafeIdSchema, z.literal("unassigned")]),
  updatedAt: IsoLikeSchema,
}).strict();

function overrideStateSchema(rowSchema: z.ZodType): z.ZodType {
  return z.object({
    version: z.literal(1),
    items: z.record(TxnIdSchema, rowSchema),
  }).strict();
}

const AccountRowSchema = z.object({
  id: SafeIdSchema.optional(),
  accountId: SafeIdSchema.optional(),
  name: z.string().trim().min(1),
  kind: z.enum(["checking", "saving", "card", "cash", "other", "bank", "broker"]).optional(),
  currency: z.literal("KRW").optional(),
  note: z.string().optional(),
  createdAt: IsoLikeSchema.optional(),
  startingBalanceKrw: z.number().int().optional(),
}).passthrough().refine((value) => Boolean(value.id || value.accountId));

const AccountsStateSchema = z.union([
  z.array(AccountRowSchema),
  z.object({
    version: z.number().int().positive().optional(),
    items: z.array(AccountRowSchema),
  }).strict(),
]);

const OpeningBalanceRowSchema = z.object({
  accountId: SafeIdSchema,
  asOfDate: z.string().regex(ISO_DATE_RE),
  amountKrw: z.number().int(),
}).strict();

const OpeningBalancesStateSchema = z.object({
  version: z.literal(1),
  items: z.record(z.string(), OpeningBalanceRowSchema),
}).strict();

const BatchMetaSchema = z.object({
  id: SafeIdSchema,
  createdAt: IsoLikeSchema,
  source: z.literal("csv"),
  rowCount: z.number().int().nonnegative(),
  ymMin: z.string().regex(/^\d{4}-\d{2}$/u).optional(),
  ymMax: z.string().regex(/^\d{4}-\d{2}$/u).optional(),
  accounts: z.array(z.object({
    id: SafeIdSchema,
    name: z.string().trim().min(1).optional(),
  }).strict()).optional(),
  importMetadata: JsonRecordSchema.optional(),
}).passthrough();

const BatchIndexSchema = z.object({
  version: z.literal(1),
  items: z.array(BatchMetaSchema),
}).strict();

const StoredBatchTransactionSchema = z.object({
  txnId: z.string().trim().min(1),
  batchId: SafeIdSchema.optional(),
  accountId: SafeIdSchema.optional(),
  date: z.string().regex(ISO_DATE_RE),
  amountKrw: z.number().finite(),
  source: z.literal("csv").optional(),
}).passthrough();

const CategoryRuleSchema = z.object({
  id: SafeIdSchema,
  categoryId: z.string().trim().min(1),
  match: z.object({
    type: z.literal("contains"),
    value: z.string().trim().min(1).max(50),
  }).strict(),
  priority: z.number().int(),
  enabled: z.boolean(),
  note: z.string().optional(),
}).strict();

const CategoryRulesStateSchema = z.object({
  version: z.literal(1),
  items: z.array(CategoryRuleSchema),
}).strict();

const ReportMetaSchema = z.object({
  version: z.literal(1),
  id: SafeIdSchema,
  createdAt: IsoLikeSchema,
  kind: z.enum(["run", "manual"]),
  runId: z.string().trim().min(1).optional(),
  recommendRunId: z.string().trim().min(1).optional(),
  pathRelative: z.string().trim().min(1),
}).strict();

const IndicatorMetaSchema = z.object({
  seriesId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  meta: SeriesSnapshotMetaSchema,
  observations: z.object({
    count: z.number().int().nonnegative(),
    firstDate: z.string().nullable().optional(),
    lastDate: z.string().nullable().optional(),
  }).strict(),
}).strict();

const IndicatorSpecOverridesSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  updatedAt: z.string().datetime().optional(),
  specs: z.array(SeriesSpecSchema).default([]),
});

const AlertEventStateSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  items: z.array(z.object({
    id: z.string().trim().min(1),
    acknowledgedAt: z.string().datetime().optional(),
    hiddenAt: z.string().datetime().optional(),
  }).strict()).default([]),
});

const LegacyBatchSchema = z.object({
  id: SafeIdSchema,
  createdAt: IsoLikeSchema,
  kind: z.literal("csv"),
  fileName: z.string().optional(),
  accountId: SafeIdSchema.optional(),
  accountHint: z.string().optional(),
  sha256: z.string().regex(SHA256_RE).optional(),
  total: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
}).passthrough();

const LegacyTransactionRecordSchema = z.object({
  id: SafeIdSchema,
  txnId: z.string().trim().min(1).optional(),
  batchId: SafeIdSchema,
  createdAt: IsoLikeSchema,
  date: z.string().trim().min(1),
  amountKrw: z.number().finite(),
  accountId: SafeIdSchema.optional(),
  description: z.string().optional(),
  source: z.literal("csv"),
}).passthrough();

function validationFailure(
  input: PayloadValidationContext,
  code: PlanningOwnerDoctorIssueCode,
  detail?: string,
): never {
  throw new PlanningOwnerDoctorValidationError(
    code,
    input.ownerId,
    input.logicalPath,
    detail,
  );
}

function decodeUtf8(input: PayloadValidationContext): string {
  try {
    return UTF8_DECODER.decode(input.bytes);
  } catch {
    return validationFailure(input, "OWNER_DOCTOR_UTF8_INVALID");
  }
}

function parseJson(input: PayloadValidationContext): unknown {
  const text = decodeUtf8(input);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return validationFailure(input, "OWNER_DOCTOR_JSON_INVALID");
  }
}

function validateSchema(
  input: PayloadValidationContext,
  schema: z.ZodType,
  value: unknown = parseJson(input),
): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    validationFailure(input, "OWNER_DOCTOR_SCHEMA_INVALID");
  }
}

function validateJsonArray(
  input: PayloadValidationContext,
  itemSchema: z.ZodType,
): void {
  const parsed = parseJson(input);
  if (!Array.isArray(parsed)) {
    validationFailure(input, "OWNER_DOCTOR_SCHEMA_INVALID");
  }
  for (const row of parsed) validateSchema(input, itemSchema, row);
}

function validateJsonLines(
  input: PayloadValidationContext,
  itemSchema?: z.ZodType,
): void {
  const text = decodeUtf8(input);
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      validationFailure(input, "OWNER_DOCTOR_NDJSON_INVALID");
    }
    if (itemSchema) validateSchema(input, itemSchema, parsed);
  }
}

function hasCanonicalBase64(value: unknown, expectedBytes?: number): boolean {
  if (typeof value !== "string" || value.length < 1) return false;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.toString("base64") !== value) return false;
  return expectedBytes === undefined || bytes.length === expectedBytes;
}

function assertStablePayloadEncryptionState(
  input: PayloadValidationContext,
  parsed: unknown,
): void {
  if (isVaultEncryptedEnvelope(parsed)) {
    if (
      !hasCanonicalBase64(parsed.iv, 12)
      || !hasCanonicalBase64(parsed.tag, 16)
      || !hasCanonicalBase64(parsed.ciphertext)
    ) {
      validationFailure(input, "OWNER_DOCTOR_ENCRYPTED_PAYLOAD_INVALID");
    }
    validationFailure(input, "OWNER_DOCTOR_ENCRYPTED_PAYLOAD_UNVERIFIED");
  }

  if (isPlanningEncryptedEnvelope(parsed)) {
    if (
      parsed.iterations !== 210_000
      || parsed.digest !== "sha256"
      || parsed.keyLength !== 32
      || !hasCanonicalBase64(parsed.salt, 16)
      || !hasCanonicalBase64(parsed.iv, 12)
      || !hasCanonicalBase64(parsed.tag, 16)
      || !hasCanonicalBase64(parsed.ciphertext)
    ) {
      validationFailure(input, "OWNER_DOCTOR_ENCRYPTED_PAYLOAD_INVALID");
    }
    validationFailure(input, "OWNER_DOCTOR_ENCRYPTED_PAYLOAD_UNVERIFIED");
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const row = parsed as Record<string, unknown>;
    const markers = ["ciphertext", "iv", "tag", "salt", "enc", "kdf", "alg"]
      .filter((key) => Object.hasOwn(row, key)).length;
    if (Object.hasOwn(row, "ciphertext") || markers >= 3) {
      validationFailure(input, "OWNER_DOCTOR_ENCRYPTED_PAYLOAD_INVALID");
    }
  }
}

function missingValidator(input: PayloadValidationContext): never {
  return validationFailure(input, "OWNER_DOCTOR_SCHEMA_VALIDATOR_MISSING");
}

function validateStableProfileRunVault(input: PayloadValidationContext): void {
  const parsed = parseJson(input);
  assertStablePayloadEncryptionState(input, parsed);
  if (
    /^profiles\/[^/]+\.json$/u.test(input.logicalPath)
    || /^vault\/profiles\/[^/]+\/profile\.json$/u.test(input.logicalPath)
  ) {
    validateSchema(input, StableProfileRecordSchema, parsed);
    return;
  }
  if (input.logicalPath === "runs/index.json") {
    validateSchema(input, StableRunIndexSchema, parsed);
    return;
  }
  if (
    /^runs\/[^/]+\.json$/u.test(input.logicalPath)
    || /^runs\/[^/]+\/run\.json$/u.test(input.logicalPath)
    || /^vault\/profiles\/[^/]+\/runs\/[^/]+\/run\.json$/u.test(input.logicalPath)
  ) {
    validateSchema(input, StableRunRecordSchema, parsed);
    return;
  }
  if (input.logicalPath === "vault/index.json" || input.logicalPath === "vault/profiles/index.json") {
    validateSchema(input, StableProfileRegistrySchema, parsed);
    return;
  }
  if (input.logicalPath === "vault/profiles.meta.json") {
    validateSchema(input, StableProfileMetaSchema, parsed);
    return;
  }
  if (/\/(?:action-plan)\.json$/u.test(input.logicalPath)) {
    validateSchema(input, StableActionPlanSchema, parsed);
    return;
  }
  if (/\/(?:action-progress)\.json$/u.test(input.logicalPath)) {
    validateSchema(input, StableActionProgressSchema, parsed);
    return;
  }
  if (/\/(?:action-center-legacy-backup)\.json$/u.test(input.logicalPath)) {
    validateSchema(input, JsonRecordSchema, parsed);
    return;
  }
  if (/\/blobs\/(?:simulate|scenarios|monteCarlo|actions|debtStrategy|raw)\.json$/u.test(input.logicalPath)) {
    validateSchema(input, JsonRecordSchema, parsed);
    return;
  }
  missingValidator(input);
}

function validateStableReports(input: PayloadValidationContext): void {
  if (/^reports\/.+\.meta\.json$/u.test(input.logicalPath)) {
    validateSchema(input, ReportMetaSchema);
    return;
  }
  if (/^reports\/.+\.md$/u.test(input.logicalPath)) {
    decodeUtf8(input);
    return;
  }
  missingValidator(input);
}

function validateAccounts(input: PayloadValidationContext): void {
  if (input.logicalPath !== "accounts.json" && input.logicalPath !== "legacy/accounts.json") {
    missingValidator(input);
  }
  validateSchema(input, AccountsStateSchema);
}

function validateOpeningBalances(input: PayloadValidationContext): void {
  if (input.logicalPath !== "opening-balances.json") missingValidator(input);
  validateSchema(input, OpeningBalancesStateSchema);
}

function validateBatches(input: PayloadValidationContext): void {
  if (input.logicalPath === "batches/index.json") {
    validateSchema(input, BatchIndexSchema);
    return;
  }
  if (/^batches\/[^/]+\.ndjson$/u.test(input.logicalPath)) {
    validateJsonLines(input, StoredBatchTransactionSchema);
    return;
  }
  missingValidator(input);
}

function validateDrafts(input: PayloadValidationContext): void {
  if (/^drafts\/cashflow\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, CashflowDraftSchema);
    return;
  }
  if (/^drafts\/profile\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, ProfileDraftSchema);
    return;
  }
  if (/^(?:drafts|legacy)\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, z.union([CashflowDraftSchema, ProfileDraftSchema]));
    return;
  }
  missingValidator(input);
}

function validateCategoryRules(input: PayloadValidationContext): void {
  if (input.logicalPath !== "category-rules.json") missingValidator(input);
  validateSchema(input, CategoryRulesStateSchema);
}

function validateTransactionOverrides(input: PayloadValidationContext): void {
  if (/^txn-overrides\/[^/]+\.json$/u.test(input.logicalPath) || input.logicalPath === "legacy/txn-overrides.json") {
    validateSchema(input, overrideStateSchema(TxnOverrideRowSchema));
    return;
  }
  if (/^txn-transfer-overrides\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, overrideStateSchema(TxnTransferOverrideRowSchema));
    return;
  }
  if (/^txn-account-overrides\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, overrideStateSchema(TxnAccountOverrideRowSchema));
    return;
  }
  missingValidator(input);
}

function validateNews(input: PayloadValidationContext): void {
  if (/^news\/items\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, NewsItemSchema);
    return;
  }
  if (input.logicalPath === "news/state.json") {
    validateSchema(input, RuntimeStateSchema);
    return;
  }
  if (/^news\/daily\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateJsonArray(input, TopicDailyStatSchema);
    return;
  }
  if (input.logicalPath === "news/digest.latest.json") {
    validateSchema(input, DailyDigestSchema);
    return;
  }
  if (input.logicalPath === "news/settings.json") {
    validateSchema(input, NewsSettingsSchema);
    return;
  }
  if (/^news\/notes\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, NewsNoteSchema);
    return;
  }
  if (input.logicalPath === "news/weekly_plan.json") {
    validateSchema(input, WeeklyPlanSchema);
    return;
  }
  if (input.logicalPath === "news/cache/today.latest.json") {
    validateSchema(input, TodayCacheSchema);
    return;
  }
  if (/^news\/cache\/trends\.(?:7|30)d\.latest\.json$/u.test(input.logicalPath)) {
    validateSchema(input, TrendsCacheSchema);
    return;
  }
  if (input.logicalPath === "news/cache/scenarios.latest.json") {
    validateSchema(input, ScenariosCacheSchema);
    return;
  }
  if (input.logicalPath === "news/cache/search-index.latest.json") {
    validateSchema(input, JsonRecordSchema);
    return;
  }
  missingValidator(input);
}

function validateIndicators(input: PayloadValidationContext): void {
  if (/^indicators\/series\/[^/]+\.jsonl$/u.test(input.logicalPath)) {
    validateJsonLines(input, ObservationSchema);
    return;
  }
  if (/^indicators\/meta\/[^/]+\.json$/u.test(input.logicalPath)) {
    validateSchema(input, IndicatorMetaSchema);
    return;
  }
  if (input.logicalPath === "indicators/state.json") {
    validateSchema(input, IndicatorsStateSchema);
    return;
  }
  if (input.logicalPath === "indicators/specOverrides.json") {
    validateSchema(input, IndicatorSpecOverridesSchema);
    return;
  }
  missingValidator(input);
}

function validateAlerts(input: PayloadValidationContext): void {
  if (input.logicalPath === "alerts/events.jsonl") {
    validateJsonLines(input, AlertEventSchema);
    return;
  }
  if (input.logicalPath === "alerts/event-state.json") {
    validateSchema(input, AlertEventStateSchema);
    return;
  }
  if (input.logicalPath === "alerts/rules.override.json") {
    validateSchema(input, AlertRuleOverridesSchema);
    return;
  }
  missingValidator(input);
}

function validateJournal(input: PayloadValidationContext): void {
  if (!/^entries\/[^/]+\.json$/u.test(input.logicalPath)) missingValidator(input);
  validateSchema(input, JournalEntrySchema);
}

function validateExposure(input: PayloadValidationContext): void {
  if (input.logicalPath !== "profile.json") missingValidator(input);
  validateSchema(input, ExposureProfileSchema);
}

function validateCsvDrafts(input: PayloadValidationContext): void {
  if (!/^drafts\/[^/]+\.json$/u.test(input.logicalPath)) missingValidator(input);
  validateSchema(input, DraftRecordSchema);
}

function validateRoutines(input: PayloadValidationContext): void {
  if (!/^daily\/[^/]+\.json$/u.test(input.logicalPath)) missingValidator(input);
  validateSchema(input, DailyRoutineChecklistSchema);
}

function validateScenarioOverrides(input: PayloadValidationContext): void {
  if (input.logicalPath !== "overrides.json") missingValidator(input);
  validateSchema(input, ScenarioLibraryOverridesSchema);
}

function validateLegacyTransactions(input: PayloadValidationContext): void {
  if (input.logicalPath === "transactions/batches.ndjson") {
    validateJsonLines(input, LegacyBatchSchema);
    return;
  }
  if (input.logicalPath === "transactions/records.ndjson") {
    validateJsonLines(input, LegacyTransactionRecordSchema);
    return;
  }
  missingValidator(input);
}

const PLANNING_OWNER_PAYLOAD_VALIDATORS = {
  "stable.profile-run-vault": validateStableProfileRunVault,
  "stable.reports": validateStableReports,
  "v3.accounts": validateAccounts,
  "v3.opening-balances": validateOpeningBalances,
  "v3.batches": validateBatches,
  "v3.drafts": validateDrafts,
  "v3.category-rules": validateCategoryRules,
  "v3.transaction-overrides": validateTransactionOverrides,
  "v3.news": validateNews,
  "v3.indicators": validateIndicators,
  "v3.alerts": validateAlerts,
  "v3.journal": validateJournal,
  "v3.exposure": validateExposure,
  "v3.csv-drafts": validateCsvDrafts,
  "v3.routines": validateRoutines,
  "v3.scenario-overrides": validateScenarioOverrides,
  "v3.legacy-transactions": validateLegacyTransactions,
} satisfies Record<PlanningDataOwnerId, PlanningOwnerPayloadValidator>;

export function validatePlanningOwnerPayloadFile(
  input: ValidatePlanningOwnerPayloadFileInput,
): void {
  let logicalPath: string;
  try {
    logicalPath = normalizePlanningOwnerLogicalPath(input.logicalPath);
  } catch {
    throw new PlanningOwnerDoctorValidationError(
      "OWNER_DOCTOR_LOGICAL_PATH_INVALID",
      input.ownerId,
      input.logicalPath,
    );
  }
  if (logicalPath !== input.logicalPath) {
    throw new PlanningOwnerDoctorValidationError(
      "OWNER_DOCTOR_LOGICAL_PATH_INVALID",
      input.ownerId,
      input.logicalPath,
    );
  }
  PLANNING_OWNER_PAYLOAD_VALIDATORS[input.ownerId]({
    ownerId: input.ownerId,
    logicalPath,
    bytes: input.bytes,
  });
}

function namespacesEqual(left: PlanningOwnerNamespace, right: PlanningOwnerNamespace): boolean {
  if (left.mode !== right.mode) return false;
  return left.mode === "shared" || (right.mode === "user" && left.userId === right.userId);
}

function normalizedPhysicalPath(value: string, platform: NodeJS.Platform): string {
  const normalized = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/u, "").normalize("NFC") || "/";
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathIsInside(parentPath: string, childPath: string, platform: NodeJS.Platform): boolean {
  const parent = normalizedPhysicalPath(parentPath, platform);
  const child = normalizedPhysicalPath(childPath, platform);
  return child === parent || child.startsWith(`${parent}/`);
}

function locationsEqual(
  left: readonly PlanningOwnerLocation[],
  right: readonly PlanningOwnerLocation[],
  platform: NodeJS.Platform,
): boolean {
  if (left.length !== right.length) return false;
  return left.every((location, index) => {
    const candidate = right[index];
    return Boolean(candidate)
      && location.logicalPath === candidate.logicalPath
      && location.kind === candidate.kind
      && (location.legacy === true) === (candidate.legacy === true)
      && normalizedPhysicalPath(location.targetPath, platform)
        === normalizedPhysicalPath(candidate.targetPath, platform);
  });
}

function contractIssues(
  canonicalOwners: readonly ResolvedPlanningDataOwner[],
  suppliedOwners: readonly ResolvedPlanningDataOwner[],
  platform: NodeJS.Platform,
): PlanningOwnerDoctorIssue[] {
  const issues: PlanningOwnerDoctorIssue[] = [];
  const canonicalIds = new Set(canonicalOwners.map((owner) => owner.ownerId));
  const suppliedById = new Map(suppliedOwners.map((owner) => [owner.ownerId, owner]));
  const duplicateSuppliedIds = new Set<string>();
  const seenSuppliedIds = new Set<string>();
  for (const owner of suppliedOwners) {
    if (seenSuppliedIds.has(owner.ownerId)) duplicateSuppliedIds.add(owner.ownerId);
    seenSuppliedIds.add(owner.ownerId);
  }

  for (const owner of canonicalOwners) {
    const supplied = suppliedById.get(owner.ownerId);
    if (!supplied) {
      issues.push(makeIssue(owner.ownerId, owner.logicalPath, "OWNER_DOCTOR_REQUIRED_OWNER_MISSING"));
      continue;
    }
    if (!namespacesEqual(owner.namespace, supplied.namespace)) {
      issues.push(makeIssue(owner.ownerId, owner.logicalPath, "OWNER_DOCTOR_NAMESPACE_MISMATCH"));
      continue;
    }
    if (
      owner.schemaVersion !== supplied.schemaVersion
      || owner.logicalPath !== supplied.logicalPath
      || owner.requiredInManifest !== supplied.requiredInManifest
      || owner.emptyAllowed !== supplied.emptyAllowed
      || !locationsEqual(owner.locations, supplied.locations, platform)
    ) {
      issues.push(makeIssue(owner.ownerId, owner.logicalPath, "OWNER_DOCTOR_CONTRACT_MISMATCH"));
    }
  }

  for (const owner of suppliedOwners) {
    if (!canonicalIds.has(owner.ownerId)) {
      issues.push(makeIssue(owner.ownerId, owner.logicalPath, "OWNER_DOCTOR_OWNER_UNKNOWN"));
    }
  }

  for (const ownerId of duplicateSuppliedIds) {
    const supplied = suppliedById.get(ownerId);
    issues.push(makeIssue(
      ownerId,
      supplied?.logicalPath ?? ownerId,
      "OWNER_DOCTOR_CONTRACT_MISMATCH",
    ));
  }

  if (
    canonicalOwners.length !== suppliedOwners.length
    || canonicalOwners.some((owner, index) => owner.ownerId !== suppliedOwners[index]?.ownerId)
  ) {
    const first = canonicalOwners[0];
    issues.push(makeIssue(first.ownerId, first.logicalPath, "OWNER_DOCTOR_CONTRACT_MISMATCH"));
  }
  return issues;
}

function makeIssue(
  check: string,
  issuePath: string,
  code: PlanningOwnerDoctorIssueCode,
): PlanningOwnerDoctorIssue {
  return Object.freeze({
    level: "error" as const,
    check,
    path: issuePath,
    code,
    message: code,
  });
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function fingerprint(stats: BigIntStats): string {
  return [
    stats.dev,
    stats.ino,
    stats.mode,
    stats.size,
    stats.mtimeNs,
    stats.ctimeNs,
  ].join(":");
}

function sourceFailure(
  ownerId: PlanningDataOwnerId,
  logicalPath: string,
  code: PlanningOwnerDoctorIssueCode,
): PlanningOwnerDoctorValidationError {
  return new PlanningOwnerDoctorValidationError(code, ownerId, logicalPath);
}

function logicalChildPath(
  ownerId: PlanningDataOwnerId,
  location: PlanningOwnerLocation,
  relativePath: string,
): string {
  const rawPath = `${location.logicalPath}/${relativePath.replaceAll("\\", "/")}`;
  try {
    return normalizePlanningOwnerLogicalPath(rawPath);
  } catch {
    throw sourceFailure(ownerId, rawPath, "OWNER_DOCTOR_LOGICAL_PATH_INVALID");
  }
}

function assertSourceIdentity(input: {
  context: PlanningArchiveContext;
  ownerId: PlanningDataOwnerId;
  logicalPath: string;
  realPath: string;
  stats: BigIntStats;
  identities: SourceIdentityState;
}): void {
  const realPathKey = normalizedPhysicalPath(input.realPath, input.context.platform);
  const inodeKey = input.stats.ino === BigInt(0)
    ? undefined
    : `${input.stats.dev}:${input.stats.ino}`;
  if (
    input.identities.realPaths.has(realPathKey)
    || (inodeKey !== undefined && input.identities.inodes.has(inodeKey))
    || (input.stats.isFile() && input.stats.nlink > BigInt(1))
  ) {
    throw sourceFailure(
      input.ownerId,
      input.logicalPath,
      "OWNER_DOCTOR_SOURCE_ALIAS_NOT_ALLOWED",
    );
  }
  input.identities.realPaths.add(realPathKey);
  if (inodeKey !== undefined) input.identities.inodes.add(inodeKey);
}

function assertBudget(
  budget: InspectionBudget,
  sizeBytes: number,
  ownerId: PlanningDataOwnerId,
  logicalPath: string,
): void {
  budget.entries += 1;
  if (
    budget.entries > MAX_ENTRIES
    || !Number.isSafeInteger(sizeBytes)
    || sizeBytes < 0
    || sizeBytes > MAX_ENTRY_BYTES
    || budget.totalBytes + sizeBytes > MAX_TOTAL_BYTES
  ) {
    throw sourceFailure(ownerId, logicalPath, "OWNER_DOCTOR_LIMIT_EXCEEDED");
  }
  budget.totalBytes += sizeBytes;
}

function readAndValidateFile(input: {
  context: PlanningArchiveContext;
  ownerId: PlanningDataOwnerId;
  logicalPath: string;
  absolutePath: string;
  realRoot: string;
  budget: InspectionBudget;
  identities: SourceIdentityState;
}): void {
  let before: BigIntStats;
  try {
    before = fs.lstatSync(input.absolutePath, { bigint: true });
  } catch {
    throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_READ_FAILED");
  }
  if (before.isSymbolicLink()) {
    throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_LINK_NOT_ALLOWED");
  }
  if (!before.isFile()) {
    throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_SPECIAL_FILE_NOT_ALLOWED");
  }
  let realPath: string;
  try {
    realPath = fs.realpathSync.native(input.absolutePath);
  } catch {
    throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_READ_FAILED");
  }
  if (!pathIsInside(input.realRoot, realPath, input.context.platform)) {
    throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_REALPATH_ESCAPE");
  }
  assertSourceIdentity({
    context: input.context,
    ownerId: input.ownerId,
    logicalPath: input.logicalPath,
    realPath,
    stats: before,
    identities: input.identities,
  });

  const sizeBytes = Number(before.size);
  assertBudget(input.budget, sizeBytes, input.ownerId, input.logicalPath);
  const flags = process.platform === "win32"
    ? constants.O_RDONLY
    : constants.O_RDONLY | constants.O_NOFOLLOW;
  let descriptor: number | undefined;
  let bytes: Buffer | undefined;
  try {
    descriptor = fs.openSync(input.absolutePath, flags);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || fingerprint(opened) !== fingerprint(before)) {
      throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_SOURCE_CHANGED");
    }
    bytes = Buffer.allocUnsafe(sizeBytes);
    let offset = 0;
    while (offset < sizeBytes) {
      const readBytes = fs.readSync(descriptor, bytes, offset, sizeBytes - offset, null);
      if (readBytes === 0) break;
      offset += readBytes;
    }
    const growthProbe = Buffer.allocUnsafe(1);
    let grew = false;
    try {
      grew = fs.readSync(descriptor, growthProbe, 0, 1, null) > 0;
    } finally {
      growthProbe.fill(0);
    }
    if (offset !== sizeBytes || grew) {
      throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_SOURCE_CHANGED");
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.lstatSync(input.absolutePath, { bigint: true });
    const realPathAfter = fs.realpathSync.native(input.absolutePath);
    if (
      fingerprint(opened) !== fingerprint(after)
      || fingerprint(after) !== fingerprint(pathAfter)
      || realPathAfter !== realPath
    ) {
      throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_SOURCE_CHANGED");
    }
    validatePlanningOwnerPayloadFile({
      ownerId: input.ownerId,
      logicalPath: input.logicalPath,
      bytes,
    });
  } catch (error) {
    if (error instanceof PlanningOwnerDoctorValidationError) throw error;
    throw sourceFailure(input.ownerId, input.logicalPath, "OWNER_DOCTOR_READ_FAILED");
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function walkDirectory(input: {
  context: PlanningArchiveContext;
  ownerId: PlanningDataOwnerId;
  location: PlanningOwnerLocation;
  absolutePath: string;
  relativePrefix: string;
  realRoot: string;
  budget: InspectionBudget;
  identities: SourceIdentityState;
}): number {
  const logicalPath = input.relativePrefix
    ? logicalChildPath(input.ownerId, input.location, input.relativePrefix)
    : input.location.logicalPath;
  const before = fs.lstatSync(input.absolutePath, { bigint: true });
  if (before.isSymbolicLink()) {
    throw sourceFailure(input.ownerId, logicalPath, "OWNER_DOCTOR_LINK_NOT_ALLOWED");
  }
  if (!before.isDirectory()) {
    throw sourceFailure(input.ownerId, logicalPath, "OWNER_DOCTOR_LOCATION_KIND_MISMATCH");
  }
  const realPath = fs.realpathSync.native(input.absolutePath);
  if (!pathIsInside(input.realRoot, realPath, input.context.platform)) {
    throw sourceFailure(input.ownerId, logicalPath, "OWNER_DOCTOR_REALPATH_ESCAPE");
  }
  assertSourceIdentity({
    context: input.context,
    ownerId: input.ownerId,
    logicalPath,
    realPath,
    stats: before,
    identities: input.identities,
  });

  const names: string[] = [];
  let directory: Dir | undefined;
  let directoryError: unknown;
  try {
    directory = fs.opendirSync(input.absolutePath);
    for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
      names.push(entry.name);
      if (input.budget.entries + names.length > MAX_ENTRIES) {
        throw sourceFailure(input.ownerId, logicalPath, "OWNER_DOCTOR_LIMIT_EXCEEDED");
      }
    }
  } catch (error) {
    directoryError = error;
  } finally {
    try {
      directory?.closeSync();
    } catch (error) {
      directoryError ??= error;
    }
  }
  if (directoryError instanceof PlanningOwnerDoctorValidationError) throw directoryError;
  if (directoryError !== undefined) {
    throw sourceFailure(input.ownerId, logicalPath, "OWNER_DOCTOR_READ_FAILED");
  }
  names.sort((left, right) => left.localeCompare(right));
  let files = 0;
  for (const name of names) {
    const absolutePath = path.join(input.absolutePath, name);
    const relativePath = input.relativePrefix ? `${input.relativePrefix}/${name}` : name;
    const childLogicalPath = logicalChildPath(input.ownerId, input.location, relativePath);
    let stats: BigIntStats;
    try {
      stats = fs.lstatSync(absolutePath, { bigint: true });
    } catch {
      throw sourceFailure(input.ownerId, childLogicalPath, "OWNER_DOCTOR_READ_FAILED");
    }
    if (stats.isSymbolicLink()) {
      throw sourceFailure(input.ownerId, childLogicalPath, "OWNER_DOCTOR_LINK_NOT_ALLOWED");
    }
    if (stats.isDirectory()) {
      input.budget.entries += 1;
      if (input.budget.entries > MAX_ENTRIES) {
        throw sourceFailure(input.ownerId, childLogicalPath, "OWNER_DOCTOR_LIMIT_EXCEEDED");
      }
      files += walkDirectory({
        ...input,
        absolutePath,
        relativePrefix: relativePath,
      });
      continue;
    }
    if (!stats.isFile()) {
      throw sourceFailure(input.ownerId, childLogicalPath, "OWNER_DOCTOR_SPECIAL_FILE_NOT_ALLOWED");
    }
    readAndValidateFile({
      context: input.context,
      ownerId: input.ownerId,
      logicalPath: childLogicalPath,
      absolutePath,
      realRoot: input.realRoot,
      budget: input.budget,
      identities: input.identities,
    });
    files += 1;
  }
  const after = fs.lstatSync(input.absolutePath, { bigint: true });
  if (fingerprint(before) !== fingerprint(after)) {
    throw sourceFailure(input.ownerId, logicalPath, "OWNER_DOCTOR_SOURCE_CHANGED");
  }
  return files;
}

function inspectLocation(input: {
  context: PlanningArchiveContext;
  ownerId: PlanningDataOwnerId;
  location: PlanningOwnerLocation;
  budget: InspectionBudget;
  identities: SourceIdentityState;
}): { missing: boolean; empty: boolean; files: number } {
  let stats: BigIntStats;
  try {
    stats = fs.lstatSync(input.location.targetPath, { bigint: true });
  } catch (error) {
    if (isMissing(error)) return { missing: true, empty: false, files: 0 };
    throw sourceFailure(input.ownerId, input.location.logicalPath, "OWNER_DOCTOR_READ_FAILED");
  }
  if (stats.isSymbolicLink()) {
    throw sourceFailure(input.ownerId, input.location.logicalPath, "OWNER_DOCTOR_LINK_NOT_ALLOWED");
  }
  if (input.location.kind === "file") {
    if (!stats.isFile()) {
      throw sourceFailure(input.ownerId, input.location.logicalPath, "OWNER_DOCTOR_LOCATION_KIND_MISMATCH");
    }
    const realPath = fs.realpathSync.native(input.location.targetPath);
    readAndValidateFile({
      context: input.context,
      ownerId: input.ownerId,
      logicalPath: input.location.logicalPath,
      absolutePath: input.location.targetPath,
      realRoot: realPath,
      budget: input.budget,
      identities: input.identities,
    });
    return { missing: false, empty: false, files: 1 };
  }
  if (!stats.isDirectory()) {
    throw sourceFailure(input.ownerId, input.location.logicalPath, "OWNER_DOCTOR_LOCATION_KIND_MISMATCH");
  }
  const realRoot = fs.realpathSync.native(input.location.targetPath);
  const files = walkDirectory({
    context: input.context,
    ownerId: input.ownerId,
    location: input.location,
    absolutePath: input.location.targetPath,
    relativePrefix: "",
    realRoot,
    budget: input.budget,
    identities: input.identities,
  });
  return { missing: false, empty: files === 0, files };
}

function normalizeCheckedAt(value: RunPlanningOwnerDoctorInput["checkedAt"]): string {
  if (value === undefined) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("OWNER_DOCTOR_CHECKED_AT_INVALID");
  return date.toISOString();
}

function sortedIssues(issues: PlanningOwnerDoctorIssue[]): readonly PlanningOwnerDoctorIssue[] {
  return Object.freeze([...issues].sort((left, right) => {
    if (left.level !== right.level) return left.level === "error" ? -1 : 1;
    if (left.check !== right.check) return left.check.localeCompare(right.check);
    if (left.path !== right.path) return left.path.localeCompare(right.path);
    return left.code.localeCompare(right.code);
  }));
}

function finalizedReport(input: {
  checkedAt: string;
  summaries: MutableSummary[];
  issues: PlanningOwnerDoctorIssue[];
}): PlanningOwnerDoctorReport {
  const errors = input.issues.filter((issue) => issue.level === "error").length;
  const warnings = input.issues.length - errors;
  const summaries = Object.freeze(input.summaries.map((summary) => Object.freeze({ ...summary })));
  return Object.freeze({
    ok: errors === 0,
    checkedAt: input.checkedAt,
    counts: Object.freeze({
      checks: summaries.length,
      files: summaries.reduce((sum, summary) => sum + summary.files, 0),
      errors,
      warnings,
    }),
    summaries,
    issues: sortedIssues(input.issues),
  });
}

export function runPlanningOwnerDoctor(
  input: RunPlanningOwnerDoctorInput,
): PlanningOwnerDoctorReport {
  const checkedAt = normalizeCheckedAt(input.checkedAt);
  const canonicalOwners = resolvePlanningDataOwners(input.context);
  if (
    canonicalOwners.length !== PLANNING_DATA_OWNER_IDS.length
    || canonicalOwners.some((owner, index) => owner.ownerId !== PLANNING_DATA_OWNER_IDS[index])
  ) {
    throw new Error("OWNER_DOCTOR_SUMMARY_CONTRACT_INVALID");
  }
  const summaries: MutableSummary[] = canonicalOwners.map((owner) => ({
    check: owner.ownerId as PlanningDataOwnerId,
    files: 0,
    errors: 0,
    warnings: 0,
    locations: owner.locations.length,
    missingLocations: 0,
    emptyLocations: 0,
  }));
  const issues = input.owners
    ? contractIssues(canonicalOwners, input.owners, input.context.platform)
    : [];
  if (issues.length > 0) {
    for (const issue of issues) {
      const summary = summaries.find((candidate) => candidate.check === issue.check);
      if (summary) summary.errors += 1;
    }
    return finalizedReport({ checkedAt, summaries, issues });
  }

  const budget: InspectionBudget = { entries: 0, totalBytes: 0 };
  const identities: SourceIdentityState = { realPaths: new Set(), inodes: new Set() };
  for (const [index, owner] of canonicalOwners.entries()) {
    const ownerId = owner.ownerId as PlanningDataOwnerId;
    const summary = summaries[index];
    for (const location of owner.locations) {
      try {
        const inspected = inspectLocation({
          context: input.context,
          ownerId,
          location,
          budget,
          identities,
        });
        summary.files += inspected.files;
        if (inspected.missing) summary.missingLocations += 1;
        if (inspected.empty) summary.emptyLocations += 1;
      } catch (error) {
        const validationError = error instanceof PlanningOwnerDoctorValidationError
          ? error
          : sourceFailure(ownerId, location.logicalPath, "OWNER_DOCTOR_READ_FAILED");
        summary.errors += 1;
        issues.push(makeIssue(ownerId, validationError.logicalPath, validationError.code));
      }
    }
    if (summary.files === 0 && !owner.emptyAllowed) {
      summary.errors += 1;
      issues.push(makeIssue(ownerId, owner.logicalPath, "OWNER_DOCTOR_EMPTY_NOT_ALLOWED"));
    }
  }
  return finalizedReport({ checkedAt, summaries, issues });
}
