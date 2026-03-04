import { z } from "zod";

export const DigestEvidenceSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  publishedAt: z.string().datetime().nullable(),
  topics: z.array(z.string().trim().min(1)).max(3),
});

export type DigestEvidence = z.infer<typeof DigestEvidenceSchema>;

export const DigestDaySchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observation: z.string().trim().min(1),
  evidence: z.array(DigestEvidenceSchema).max(5),
  watchlist: z.array(z.string().trim().min(1)).max(8),
  counterSignals: z.array(z.string().trim().min(1)).max(6),
});

export type DigestDay = z.infer<typeof DigestDaySchema>;
