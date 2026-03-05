import { z } from "zod";

export const ImpactGradeSchema = z.enum(["High", "Med", "Low", "Unknown"]);

export const JournalImpactSnapshotSchema = z.object({
  scenarioId: z.string().trim().min(1),
  cashflowRisk: ImpactGradeSchema,
  debtServiceRisk: ImpactGradeSchema,
  inflationPressureRisk: ImpactGradeSchema,
  fxPressureRisk: ImpactGradeSchema,
  incomeRisk: ImpactGradeSchema,
  bufferAdequacy: ImpactGradeSchema,
});

export const JournalEntrySchema = z.object({
  id: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observations: z.array(z.string().trim().min(1)).default([]),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  chosenOptions: z.array(z.string().trim().min(1)).default([]),
  followUpChecklist: z.array(z.string().trim().min(1)).default([]),
  linkedItems: z.array(z.string().trim().min(1)).default([]),
  linkedIndicators: z.array(z.string().trim().min(1)).default([]),
  linkedScenarioIds: z.array(z.string().trim().min(1)).default([]),
  impactSnapshot: z.array(JournalImpactSnapshotSchema).default([]),
  watchSeriesIds: z.array(z.string().trim().min(1)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const JournalEntryInputSchema = JournalEntrySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export type JournalEntryInput = z.infer<typeof JournalEntryInputSchema>;

export function parseJournalEntry(value: unknown): JournalEntry {
  return JournalEntrySchema.parse(value);
}

export function parseJournalEntryInput(value: unknown): JournalEntryInput {
  return JournalEntryInputSchema.parse(value);
}
