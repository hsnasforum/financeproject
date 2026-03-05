import { z } from "zod";

export const BurstGradeSchema = z.enum(["High", "Med", "Low", "Unknown"]);
export type BurstGrade = z.infer<typeof BurstGradeSchema>;

export const BurstRationaleSchema = z.object({
  historyDays: z.number().int().nonnegative(),
  baselineAvg: z.number().finite(),
  todayCount: z.number().int().nonnegative(),
  ratio: z.number().finite(),
  delta: z.number().int(),
});
export type BurstRationale = z.infer<typeof BurstRationaleSchema>;

export const TopicDailyStatSchema = z.object({
  dateKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  scoreSum: z.number().finite(),
  sourceDiversity: z.number().finite().min(0).max(1),
  burstGrade: BurstGradeSchema.default("Unknown"),
});
export type TopicDailyStat = z.infer<typeof TopicDailyStatSchema>;

