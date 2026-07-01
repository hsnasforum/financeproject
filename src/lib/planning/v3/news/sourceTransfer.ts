import crypto from "node:crypto";
import { z } from "zod";
import { type NewsCustomSource, type NewsSettings, type NewsSourceOverride } from "./contracts";
import { NEWS_SOURCES } from "./sources";
import { readNewsSettings, writeNewsSettings } from "./settings";

export const NewsSourceTransferItemSchema = z.object({
  url: z.string().trim().url(),
  weight: z.number().finite(),
  enabled: z.boolean(),
});
export type NewsSourceTransferItem = z.infer<typeof NewsSourceTransferItemSchema>;

const ImportIssueSchema = z.object({
  index: z.number().int().nonnegative(),
  code: z.enum(["INVALID_ITEM", "DUPLICATE_URL"]),
  message: z.string().trim().min(1),
});
export type ImportIssue = z.infer<typeof ImportIssueSchema>;

const PreviewRowSchema = z.object({
  index: z.number().int().nonnegative(),
  sourceId: z.string().trim().min(1),
  url: z.string().trim().url(),
  weight: z.number().finite(),
  enabled: z.boolean(),
  action: z.enum(["update", "create"]),
});
type PreviewRow = z.infer<typeof PreviewRowSchema>;

export const NewsSourceImportPreviewSchema = z.object({
  totalInput: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  createCount: z.number().int().nonnegative(),
  updateCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
  issues: z.array(ImportIssueSchema),
  rows: z.array(PreviewRowSchema),
});
export type NewsSourceImportPreview = z.infer<typeof NewsSourceImportPreviewSchema>;

export const NewsSourceImportApplyResultSchema = z.object({
  preview: NewsSourceImportPreviewSchema,
  updatedOverrides: z.number().int().nonnegative(),
  customSources: z.number().int().nonnegative(),
});
export type NewsSourceImportApplyResult = z.infer<typeof NewsSourceImportApplyResultSchema>;

function canonicalizeUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
      if (!url.pathname) url.pathname = "/";
    }
    const sorted = [...url.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    url.search = sorted ? `?${sorted}` : "";
    return url.toString();
  } catch {
    return null;
  }
}

function idFromUrl(url: string): string {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  return `custom_${hash}`;
}

function sourceNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return "custom-feed";
  }
}

function buildExistingSourceMaps(settings: NewsSettings): {
  byCanonicalUrl: Map<string, { id: string; isCustom: boolean }>;
  usedIds: Set<string>;
} {
  const map = new Map<string, { id: string; isCustom: boolean }>();
  for (const source of NEWS_SOURCES) {
    const canonical = canonicalizeUrl(source.feedUrl);
    if (!canonical) continue;
    map.set(canonical, { id: source.id, isCustom: false });
  }
  for (const source of settings.customSources ?? []) {
    const canonical = canonicalizeUrl(source.feedUrl);
    if (!canonical) continue;
    map.set(canonical, { id: source.id, isCustom: true });
  }

  const usedIds = new Set<string>([
    ...NEWS_SOURCES.map((row) => row.id),
    ...(settings.customSources ?? []).map((row) => row.id),
  ]);
  return { byCanonicalUrl: map, usedIds };
}

function buildPreviewRows(items: unknown[], settings: NewsSettings): NewsSourceImportPreview {
  const issues: ImportIssue[] = [];
  const rows: PreviewRow[] = [];
  const seenCanonical = new Set<string>();
  const existing = buildExistingSourceMaps(settings);

  for (let index = 0; index < items.length; index += 1) {
    const parsed = NewsSourceTransferItemSchema.safeParse(items[index]);
    if (!parsed.success) {
      issues.push({
        index,
        code: "INVALID_ITEM",
        message: "입력 항목 형식이 올바르지 않습니다.",
      });
      continue;
    }
    const canonicalUrl = canonicalizeUrl(parsed.data.url);
    if (!canonicalUrl) {
      issues.push({
        index,
        code: "INVALID_ITEM",
        message: "URL 형식이 올바르지 않습니다.",
      });
      continue;
    }
    if (seenCanonical.has(canonicalUrl)) {
      issues.push({
        index,
        code: "DUPLICATE_URL",
        message: "동일 URL이 중복되었습니다.",
      });
      continue;
    }
    seenCanonical.add(canonicalUrl);

    const existingRow = existing.byCanonicalUrl.get(canonicalUrl);
    if (existingRow) {
      rows.push({
        index,
        sourceId: existingRow.id,
        url: canonicalUrl,
        weight: parsed.data.weight,
        enabled: parsed.data.enabled,
        action: "update",
      });
      continue;
    }

    const seedId = idFromUrl(canonicalUrl);
    let sourceId = seedId;
    let suffix = 1;
    while (existing.usedIds.has(sourceId)) {
      suffix += 1;
      sourceId = `${seedId}_${suffix}`;
    }
    existing.usedIds.add(sourceId);
    rows.push({
      index,
      sourceId,
      url: canonicalUrl,
      weight: parsed.data.weight,
      enabled: parsed.data.enabled,
      action: "create",
    });
  }

  const createCount = rows.filter((row) => row.action === "create").length;
  const updateCount = rows.length - createCount;
  return NewsSourceImportPreviewSchema.parse({
    totalInput: items.length,
    validRows: rows.length,
    createCount,
    updateCount,
    duplicateCount: issues.filter((row) => row.code === "DUPLICATE_URL").length,
    issueCount: issues.length,
    issues,
    rows,
  });
}

export function exportNewsSourceList(rootDir?: string): NewsSourceTransferItem[] {
  const settings = readNewsSettings(rootDir);
  const effectiveDefaults = new Map(NEWS_SOURCES.map((row) => [row.id, row]));
  const custom = settings.customSources ?? [];
  const rows: NewsSourceTransferItem[] = [];

  for (const source of NEWS_SOURCES) {
    const override = (settings.sources ?? []).find((row) => row.id === source.id);
    rows.push(NewsSourceTransferItemSchema.parse({
      url: source.feedUrl,
      weight: Number.isFinite(override?.weight) ? Number(override?.weight) : source.weight,
      enabled: typeof override?.enabled === "boolean" ? override.enabled : source.enabled,
    }));
  }
  for (const source of custom) {
    if (effectiveDefaults.has(source.id)) continue;
    rows.push(NewsSourceTransferItemSchema.parse({
      url: source.feedUrl,
      weight: source.weight,
      enabled: source.enabled,
    }));
  }

  return rows.sort((a, b) => a.url.localeCompare(b.url));
}

export function previewImportNewsSources(items: unknown[], options: { rootDir?: string } = {}): NewsSourceImportPreview {
  const settings = readNewsSettings(options.rootDir);
  return buildPreviewRows(items, settings);
}

export function applyImportNewsSources(items: unknown[], options: { rootDir?: string } = {}): NewsSourceImportApplyResult {
  const settings = readNewsSettings(options.rootDir);
  const preview = buildPreviewRows(items, settings);
  if (preview.rows.length < 1) {
    return NewsSourceImportApplyResultSchema.parse({
      preview,
      updatedOverrides: settings.sources.length,
      customSources: settings.customSources.length,
    });
  }

  const overridesMap = new Map<string, NewsSourceOverride>(
    (settings.sources ?? []).map((row) => [row.id, row]),
  );
  const customMap = new Map<string, NewsCustomSource>(
    (settings.customSources ?? []).map((row) => [row.id, row]),
  );

  for (const row of preview.rows) {
    if (row.action === "create") {
      const customSource: NewsCustomSource = {
        id: row.sourceId,
        name: sourceNameFromUrl(row.url),
        feedUrl: row.url,
        homepageUrl: (() => {
          try {
            return new URL(row.url).origin;
          } catch {
            return undefined;
          }
        })(),
        country: "ZZ",
        language: "und",
        weight: row.weight,
        enabled: row.enabled,
      };
      customMap.set(row.sourceId, customSource);
      continue;
    }

    overridesMap.set(row.sourceId, {
      id: row.sourceId,
      enabled: row.enabled,
      weight: row.weight,
    });
  }

  const next = writeNewsSettings({
    ...settings,
    sources: [...overridesMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    customSources: [...customMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }, options.rootDir);

  return NewsSourceImportApplyResultSchema.parse({
    preview,
    updatedOverrides: next.sources.length,
    customSources: next.customSources.length,
  });
}
