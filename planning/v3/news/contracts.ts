import { z } from "zod";

export const NewsSourceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  feedUrl: z.string().trim().url(),
  homepageUrl: z.string().trim().url().optional(),
  weight: z.number().finite(),
  enabled: z.boolean(),
});

export type NewsSource = z.infer<typeof NewsSourceSchema>;

export const NewsItemSchema = z.object({
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  publishedAt: z.string().datetime().optional(),
  guid: z.string().trim().min(1).optional(),
  snippet: z.string().max(1500).optional(),
  fetchedAt: z.string().datetime(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

export const IngestErrorSchema = z.object({
  sourceId: z.string().trim().min(1),
  message: z.string().trim().min(1),
  status: z.number().int().optional(),
});

export type IngestError = z.infer<typeof IngestErrorSchema>;

export const IngestResultSchema = z.object({
  sourcesProcessed: z.number().int().nonnegative(),
  itemsFetched: z.number().int().nonnegative(),
  itemsNew: z.number().int().nonnegative(),
  itemsDeduped: z.number().int().nonnegative(),
  errors: z.array(IngestErrorSchema),
});

export type IngestResult = z.infer<typeof IngestResultSchema>;

export const RawFeedEntrySchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  guid: z.string().optional(),
  publishedAt: z.string().optional(),
  snippet: z.string().optional(),
});

export type RawFeedEntry = z.infer<typeof RawFeedEntrySchema>;

export const SourceRuntimeStateSchema = z.object({
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  lastRunAt: z.string().datetime().optional(),
});

export type SourceRuntimeState = z.infer<typeof SourceRuntimeStateSchema>;

export const RuntimeStateSchema = z.object({
  lastRunAt: z.string().datetime().optional(),
  sources: z.record(z.string(), SourceRuntimeStateSchema).default({}),
});

export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export function parseNewsSource(value: unknown): NewsSource {
  return NewsSourceSchema.parse(value);
}

export function parseNewsItem(value: unknown): NewsItem {
  return NewsItemSchema.parse(value);
}

export function parseRuntimeState(value: unknown): RuntimeState {
  return RuntimeStateSchema.parse(value);
}
