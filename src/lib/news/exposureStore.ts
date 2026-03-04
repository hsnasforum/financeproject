import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolveDataDir } from "../planning/storage/dataDir.ts";
import { type ExposureProfile } from "./types.ts";

const ExposureRateTypeSchema = z.enum(["fixed", "variable", "mixed", "none"]);
const ExposureHorizonSchema = z.enum(["short", "medium", "long", "none"]);
const ExposureLevelSchema = z.enum(["low", "medium", "high"]);
const IncomeStabilitySchema = z.enum(["stable", "moderate", "fragile"]);

export const ExposureProfileSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  debt: z.object({
    hasDebt: z.boolean().optional(),
    rateType: ExposureRateTypeSchema.optional(),
    repricingHorizon: ExposureHorizonSchema.optional(),
  }).optional(),
  inflation: z.object({
    essentialExpenseShare: ExposureLevelSchema.optional(),
    rentOrMortgageShare: ExposureLevelSchema.optional(),
    energyShare: ExposureLevelSchema.optional(),
  }).optional(),
  fx: z.object({
    foreignConsumption: ExposureLevelSchema.optional(),
    foreignIncome: ExposureLevelSchema.optional(),
  }).optional(),
  income: z.object({
    incomeStability: IncomeStabilitySchema.optional(),
  }).optional(),
  liquidity: z.object({
    monthsOfCashBuffer: ExposureLevelSchema.optional(),
  }).optional(),
}).strict();

const ExposureProfileInputSchema = ExposureProfileSchema.omit({
  updatedAt: true,
}).strict();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveExposureRoot(cwd = process.cwd()): string {
  return path.join(resolveDataDir({ cwd }), "exposure");
}

export function resolveExposureProfilePath(cwd = process.cwd()): string {
  return path.join(resolveExposureRoot(cwd), "profile.json");
}

function pruneEmptyObjects(profile: ExposureProfile): ExposureProfile {
  const next: ExposureProfile = {
    ...(profile.updatedAt ? { updatedAt: profile.updatedAt } : {}),
  };

  if (profile.debt && Object.keys(profile.debt).length > 0) next.debt = profile.debt;
  if (profile.inflation && Object.keys(profile.inflation).length > 0) next.inflation = profile.inflation;
  if (profile.fx && Object.keys(profile.fx).length > 0) next.fx = profile.fx;
  if (profile.income && Object.keys(profile.income).length > 0) next.income = profile.income;
  if (profile.liquidity && Object.keys(profile.liquidity).length > 0) next.liquidity = profile.liquidity;

  return next;
}

export function parseExposureProfileInput(value: unknown): Omit<ExposureProfile, "updatedAt"> {
  return ExposureProfileInputSchema.parse(value);
}

export function readExposureProfile(cwd = process.cwd()): ExposureProfile | null {
  const filePath = resolveExposureProfilePath(cwd);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    const normalized = ExposureProfileSchema.parse(parsed);
    return pruneEmptyObjects(normalized);
  } catch {
    return null;
  }
}

export function writeExposureProfile(input: unknown, cwd = process.cwd()): ExposureProfile {
  const body = parseExposureProfileInput(input);
  const next = pruneEmptyObjects({
    ...body,
    updatedAt: new Date().toISOString(),
  });

  const rootDir = resolveExposureRoot(cwd);
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(resolveExposureProfilePath(cwd), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

export function clearExposureProfile(cwd = process.cwd()): void {
  const filePath = resolveExposureProfilePath(cwd);
  if (!asString(filePath)) return;
  if (!fs.existsSync(filePath)) return;
  fs.unlinkSync(filePath);
}
