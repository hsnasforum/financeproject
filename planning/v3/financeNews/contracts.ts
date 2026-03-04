import { z } from "zod";

export const RiskGradeSchema = z.enum(["High", "Med", "Low", "Unknown"]);
export type RiskGrade = z.infer<typeof RiskGradeSchema>;

export const ScenarioSignalStatusSchema = z.enum(["met", "not_met", "unknown"]);
export type ScenarioSignalStatus = z.infer<typeof ScenarioSignalStatusSchema>;

export const IndicatorGradeSchema = z.enum(["up", "down", "high", "low", "flat", "unknown"]);
export type IndicatorGrade = z.infer<typeof IndicatorGradeSchema>;

export const ScenarioForImpactSchema = z.object({
  name: z.enum(["Base", "Bull", "Bear"]),
  triggerStatus: ScenarioSignalStatusSchema.default("unknown"),
  linkedTopics: z.array(z.string().trim().min(1)).default([]),
  confirmIndicators: z.array(z.string().trim().min(1)).default([]),
  leadingIndicators: z.array(z.string().trim().min(1)).default([]),
  observation: z.string().trim().optional(),
  triggerSummary: z.string().trim().optional(),
});
export type ScenarioForImpact = z.infer<typeof ScenarioForImpactSchema>;

export const ImpactResultSchema = z.object({
  cashflowRisk: RiskGradeSchema,
  debtServiceRisk: RiskGradeSchema,
  inflationPressureRisk: RiskGradeSchema,
  fxPressureRisk: RiskGradeSchema,
  incomeRisk: RiskGradeSchema,
  bufferAdequacy: RiskGradeSchema,
  rationale: z.array(z.string().trim().min(1)),
  watch: z.array(z.string().trim().min(1)),
});
export type ImpactResult = z.infer<typeof ImpactResultSchema>;

export const StressResultSchema = z.object({
  pressureAreas: z.array(z.string().trim().min(1)),
  resilienceNotes: z.array(z.string().trim().min(1)),
  monitoringOptions: z.array(z.string().trim().min(1)),
});
export type StressResult = z.infer<typeof StressResultSchema>;
