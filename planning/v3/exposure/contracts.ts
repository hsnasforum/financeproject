import { z } from "zod";

export const ExposureHasDebtSchema = z.enum(["yes", "no", "unknown"]);
export const ExposureRateTypeSchema = z.enum(["fixed", "variable", "mixed", "none", "unknown"]);
export const ExposureHorizonSchema = z.enum(["short", "medium", "long", "none", "unknown"]);
export const ExposureLevelSchema = z.enum(["low", "medium", "high", "unknown"]);
export const ExposureIncomeStabilitySchema = z.enum(["stable", "moderate", "fragile", "unknown"]);

export const ExposureProfileSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  savedAt: z.string().datetime().optional(),
  debt: z.object({
    hasDebt: ExposureHasDebtSchema.default("unknown"),
    rateType: ExposureRateTypeSchema.default("unknown"),
    repricingHorizon: ExposureHorizonSchema.default("unknown"),
  }).default({
    hasDebt: "unknown",
    rateType: "unknown",
    repricingHorizon: "unknown",
  }),
  inflation: z.object({
    essentialExpenseShare: ExposureLevelSchema.default("unknown"),
    rentOrMortgageShare: ExposureLevelSchema.default("unknown"),
    energyShare: ExposureLevelSchema.default("unknown"),
  }).default({
    essentialExpenseShare: "unknown",
    rentOrMortgageShare: "unknown",
    energyShare: "unknown",
  }),
  fx: z.object({
    foreignConsumption: ExposureLevelSchema.default("unknown"),
    foreignIncome: ExposureLevelSchema.default("unknown"),
  }).default({
    foreignConsumption: "unknown",
    foreignIncome: "unknown",
  }),
  income: z.object({
    incomeStability: ExposureIncomeStabilitySchema.default("unknown"),
  }).default({
    incomeStability: "unknown",
  }),
  liquidity: z.object({
    monthsOfCashBuffer: ExposureLevelSchema.default("unknown"),
  }).default({
    monthsOfCashBuffer: "unknown",
  }),
}).strict();

export const ExposureProfileInputSchema = ExposureProfileSchema.omit({
  savedAt: true,
});

export type ExposureProfile = z.infer<typeof ExposureProfileSchema>;
export type ExposureProfileInput = z.infer<typeof ExposureProfileInputSchema>;

export function parseExposureProfile(value: unknown): ExposureProfile {
  return ExposureProfileSchema.parse(value);
}

export function parseExposureProfileInput(value: unknown): ExposureProfileInput {
  return ExposureProfileInputSchema.parse(value);
}

export function normalizeExposureProfile(value: unknown): ExposureProfile {
  return ExposureProfileSchema.parse(value);
}
