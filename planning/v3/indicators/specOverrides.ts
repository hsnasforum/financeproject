import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { normalizeSeriesId } from "./aliases";
import { IndicatorSourceSchema, SeriesSpecSchema, type SeriesSpec } from "./contracts";
import { INDICATOR_SERIES_SPECS, INDICATOR_SOURCES } from "./specs";
import { parseWithV3Whitelist } from "../security/whitelist";

const DEFAULT_ROOT = path.join(process.cwd(), ".data", "indicators");

const SpecOverridesSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  updatedAt: z.string().datetime().optional(),
  specs: z.array(SeriesSpecSchema).default([]),
});
type SpecOverrides = z.infer<typeof SpecOverridesSchema>;

const ImportIssueSchema = z.object({
  index: z.number().int().nonnegative(),
  code: z.enum(["INVALID_ITEM", "DUPLICATE_ID", "UNKNOWN_SOURCE"]),
  message: z.string().trim().min(1),
});
type ImportIssue = z.infer<typeof ImportIssueSchema>;

const PreviewRowSchema = z.object({
  index: z.number().int().nonnegative(),
  id: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  action: z.enum(["update", "create"]),
});
type PreviewRow = z.infer<typeof PreviewRowSchema>;

export const IndicatorSpecsImportPreviewSchema = z.object({
  totalInput: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  createCount: z.number().int().nonnegative(),
  updateCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
  issues: z.array(ImportIssueSchema),
  rows: z.array(PreviewRowSchema),
  specs: z.array(SeriesSpecSchema),
});
export type IndicatorSpecsImportPreview = z.infer<typeof IndicatorSpecsImportPreviewSchema>;

export const IndicatorSpecsImportApplyResultSchema = z.object({
  preview: IndicatorSpecsImportPreviewSchema,
  overridesCount: z.number().int().nonnegative(),
  effectiveCount: z.number().int().nonnegative(),
});
export type IndicatorSpecsImportApplyResult = z.infer<typeof IndicatorSpecsImportApplyResultSchema>;

function defaultOverrides(): SpecOverrides {
  return {
    schemaVersion: 1,
    updatedAt: undefined,
    specs: [],
  };
}

export function resolveSpecOverridesPath(rootDir = DEFAULT_ROOT): string {
  return path.join(rootDir, "specOverrides.json");
}

export function readSeriesSpecOverrides(rootDir = DEFAULT_ROOT): SpecOverrides {
  const filePath = resolveSpecOverridesPath(rootDir);
  if (!fs.existsSync(filePath)) return defaultOverrides();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return SpecOverridesSchema.parse(parsed);
  } catch {
    return defaultOverrides();
  }
}

export function writeSeriesSpecOverrides(specs: SeriesSpec[], rootDir = DEFAULT_ROOT): SpecOverrides {
  const next = parseWithV3Whitelist(SpecOverridesSchema, {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    specs,
  }, {
    scope: "persistence",
    context: "indicators.specOverrides",
  });
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(resolveSpecOverridesPath(rootDir), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

function canonicalizeSpec(input: SeriesSpec): SeriesSpec {
  return SeriesSpecSchema.parse({
    ...input,
    id: normalizeSeriesId(input.id),
    sourceId: input.sourceId.trim().toLowerCase(),
    transform: input.transform ?? "none",
    enabled: input.enabled !== false,
  });
}

export function loadEffectiveSeriesSpecs(rootDir = DEFAULT_ROOT): SeriesSpec[] {
  const overrides = readSeriesSpecOverrides(rootDir);
  const map = new Map<string, SeriesSpec>();
  for (const row of INDICATOR_SERIES_SPECS) {
    map.set(normalizeSeriesId(row.id), canonicalizeSpec(row));
  }
  for (const row of overrides.specs) {
    const spec = canonicalizeSpec(row);
    map.set(spec.id, spec);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function exportSeriesSpecList(rootDir?: string): SeriesSpec[] {
  return loadEffectiveSeriesSpecs(rootDir)
    .map((row) => SeriesSpecSchema.parse(row))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildPreviewRows(items: unknown[], rootDir = DEFAULT_ROOT): IndicatorSpecsImportPreview {
  const sourceIds = new Set(INDICATOR_SOURCES.map((row) => IndicatorSourceSchema.parse(row).id));
  const issues: ImportIssue[] = [];
  const rows: PreviewRow[] = [];
  const specs: SeriesSpec[] = [];
  const seenIds = new Set<string>();
  const defaultIds = new Set(INDICATOR_SERIES_SPECS.map((row) => normalizeSeriesId(row.id)));
  const overrideIds = new Set(readSeriesSpecOverrides(rootDir).specs.map((row) => normalizeSeriesId(row.id)));

  for (let index = 0; index < items.length; index += 1) {
    const parsed = SeriesSpecSchema.safeParse(items[index]);
    if (!parsed.success) {
      issues.push({
        index,
        code: "INVALID_ITEM",
        message: "series spec 형식이 올바르지 않습니다.",
      });
      continue;
    }
    const spec = canonicalizeSpec(parsed.data);
    if (!sourceIds.has(spec.sourceId)) {
      issues.push({
        index,
        code: "UNKNOWN_SOURCE",
        message: `알 수 없는 sourceId 입니다: ${spec.sourceId}`,
      });
      continue;
    }
    if (seenIds.has(spec.id)) {
      issues.push({
        index,
        code: "DUPLICATE_ID",
        message: `동일 id가 중복되었습니다: ${spec.id}`,
      });
      continue;
    }
    seenIds.add(spec.id);
    specs.push(spec);
    rows.push({
      index,
      id: spec.id,
      sourceId: spec.sourceId,
      action: defaultIds.has(spec.id) || overrideIds.has(spec.id) ? "update" : "create",
    });
  }

  const createCount = rows.filter((row) => row.action === "create").length;
  const updateCount = rows.length - createCount;
  return IndicatorSpecsImportPreviewSchema.parse({
    totalInput: items.length,
    validRows: rows.length,
    createCount,
    updateCount,
    duplicateCount: issues.filter((row) => row.code === "DUPLICATE_ID").length,
    issueCount: issues.length,
    issues,
    rows,
    specs,
  });
}

export function previewImportSeriesSpecs(items: unknown[], rootDir = DEFAULT_ROOT): IndicatorSpecsImportPreview {
  return buildPreviewRows(items, rootDir);
}

export function applyImportSeriesSpecs(items: unknown[], rootDir = DEFAULT_ROOT): IndicatorSpecsImportApplyResult {
  const preview = buildPreviewRows(items, rootDir);
  const current = readSeriesSpecOverrides(rootDir);
  const map = new Map<string, SeriesSpec>(
    (current.specs ?? []).map((row) => {
      const spec = canonicalizeSpec(row);
      return [spec.id, spec] as const;
    }),
  );
  for (const spec of preview.specs) {
    map.set(spec.id, spec);
  }

  const next = writeSeriesSpecOverrides(
    [...map.values()].sort((a, b) => a.id.localeCompare(b.id)),
    rootDir,
  );

  return IndicatorSpecsImportApplyResultSchema.parse({
    preview,
    overridesCount: next.specs.length,
    effectiveCount: loadEffectiveSeriesSpecs(rootDir).length,
  });
}
