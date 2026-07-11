import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { normalizeSeriesId } from "./aliases";
import { IndicatorSourceSchema, SeriesSpecSchema, type SeriesSpec } from "./contracts";
import { resolveIndicatorsRootDir } from "./rootDir";
import { INDICATOR_SERIES_SPECS, INDICATOR_SOURCES } from "./specs";
import { parseWithV3Whitelist } from "../security/whitelist";

const SpecOverridesSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  updatedAt: z.string().datetime().optional(),
  specs: z.array(SeriesSpecSchema).default([]),
});
type SpecOverrides = z.infer<typeof SpecOverridesSchema>;

const LegacyIndicatorSourcesFileSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime().optional(),
  sources: z.array(IndicatorSourceSchema),
});

const LegacySeriesSpecSchema = SeriesSpecSchema.omit({
  frequency: true,
  enabled: true,
}).extend({
  frequency: z.enum(["D", "W", "M", "Q", "Y", "A"]),
  enabled: z.boolean().optional(),
});

const LegacyIndicatorSeriesFileSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().datetime().optional(),
  series: z.array(LegacySeriesSpecSchema),
});

export type IndicatorConfigErrorCode =
  | "INCOMPLETE_LEGACY_CONFIG"
  | "INVALID_LEGACY_CONFIG"
  | "INVALID_RUNTIME_OVERRIDES"
  | "UNSAFE_BUILT_IN_CONFIG";

export class IndicatorConfigError extends Error {
  readonly code: IndicatorConfigErrorCode;

  constructor(code: IndicatorConfigErrorCode, message: string) {
    super(message);
    this.name = "IndicatorConfigError";
    this.code = code;
  }
}

export type EffectiveIndicatorConfig = {
  baseSource: "built-in" | "legacy-compat";
  sources: Array<z.infer<typeof IndicatorSourceSchema>>;
  specs: SeriesSpec[];
  runtimeOverrideCount: number;
};

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

function defaultRootDir(): string {
  return resolveIndicatorsRootDir();
}

function defaultOverrides(): SpecOverrides {
  return {
    schemaVersion: 1,
    updatedAt: undefined,
    specs: [],
  };
}

function readCompatibilityJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  } catch {
    throw new IndicatorConfigError(
      "INVALID_LEGACY_CONFIG",
      "지표 compatibility config를 읽을 수 없습니다: " + path.basename(filePath),
    );
  }
}

export function loadLegacyIndicatorConfigAdapter(cwd = process.cwd()): {
  status: "absent" | "loaded";
  sources: Array<z.infer<typeof IndicatorSourceSchema>>;
  specs: SeriesSpec[];
} {
  const sourcesPath = path.join(cwd, "config", "indicators-sources.json");
  const seriesPath = path.join(cwd, "config", "indicators-series.json");
  const hasSources = fs.existsSync(sourcesPath);
  const hasSeries = fs.existsSync(seriesPath);

  if (!hasSources && !hasSeries) {
    return { status: "absent", sources: [], specs: [] };
  }
  if (hasSources !== hasSeries) {
    throw new IndicatorConfigError(
      "INCOMPLETE_LEGACY_CONFIG",
      "지표 compatibility config 두 파일이 모두 필요합니다.",
    );
  }

  try {
    const sourcesFile = LegacyIndicatorSourcesFileSchema.parse(readCompatibilityJson(sourcesPath));
    const seriesFile = LegacyIndicatorSeriesFileSchema.parse(readCompatibilityJson(seriesPath));
    const sources = sourcesFile.sources.map((row) => IndicatorSourceSchema.parse({
      ...row,
      id: row.id.trim().toLowerCase(),
    }));
    if (new Set(sources.map((row) => row.id)).size !== sources.length) {
      throw new IndicatorConfigError(
        "INVALID_LEGACY_CONFIG",
        "지표 compatibility source id가 중복되었습니다.",
      );
    }
    const sourceById = new Map(sources.map((row) => [row.id, row] as const));
    const sourceIds = new Set(sourceById.keys());
    const specs = seriesFile.series.map((row) => {
      const sourceId = row.sourceId.trim().toLowerCase();
      return SeriesSpecSchema.parse({
        ...row,
        id: normalizeSeriesId(row.id),
        sourceId,
        frequency: row.frequency === "A" ? "Y" : row.frequency,
        transform: row.transform ?? "none",
        enabled: row.enabled ?? sourceById.get(sourceId)?.enabled ?? false,
      });
    });
    const unknownSource = specs.find((row) => !sourceIds.has(row.sourceId));
    if (unknownSource) {
      throw new IndicatorConfigError(
        "INVALID_LEGACY_CONFIG",
        "지표 compatibility series의 sourceId를 찾을 수 없습니다: " + unknownSource.sourceId,
      );
    }
    if (new Set(specs.map((row) => row.id)).size !== specs.length) {
      throw new IndicatorConfigError(
        "INVALID_LEGACY_CONFIG",
        "지표 compatibility series id가 중복되었습니다.",
      );
    }
    return { status: "loaded", sources, specs };
  } catch (error) {
    if (error instanceof IndicatorConfigError) throw error;
    throw new IndicatorConfigError(
      "INVALID_LEGACY_CONFIG",
      "지표 compatibility config 형식이 올바르지 않습니다.",
    );
  }
}

export function resolveSpecOverridesPath(rootDir = defaultRootDir()): string {
  return path.join(rootDir, "specOverrides.json");
}

export function readSeriesSpecOverrides(rootDir = defaultRootDir()): SpecOverrides {
  const filePath = resolveSpecOverridesPath(rootDir);
  if (!fs.existsSync(filePath)) return defaultOverrides();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    const overrides = SpecOverridesSchema.parse(parsed);
    const normalizedIds = overrides.specs.map((row) => normalizeSeriesId(row.id));
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      throw new IndicatorConfigError(
        "INVALID_RUNTIME_OVERRIDES",
        "지표 runtime override id가 중복되었습니다.",
      );
    }
    return overrides;
  } catch (error) {
    if (error instanceof IndicatorConfigError) throw error;
    throw new IndicatorConfigError(
      "INVALID_RUNTIME_OVERRIDES",
      "지표 runtime override 형식이 올바르지 않습니다.",
    );
  }
}

export function writeSeriesSpecOverrides(specs: SeriesSpec[], rootDir = defaultRootDir()): SpecOverrides {
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

export function loadEffectiveIndicatorConfig(options: {
  rootDir?: string;
  cwd?: string;
} = {}): EffectiveIndicatorConfig {
  const rootDir = options.rootDir ?? defaultRootDir();
  const legacy = loadLegacyIndicatorConfigAdapter(options.cwd ?? process.cwd());
  const sourceMap = new Map<string, z.infer<typeof IndicatorSourceSchema>>();
  for (const row of INDICATOR_SOURCES) {
    const source = IndicatorSourceSchema.parse({
      ...row,
      id: row.id.trim().toLowerCase(),
    });
    sourceMap.set(source.id, source);
  }
  for (const row of legacy.sources) {
    sourceMap.set(row.id, row);
  }

  const overrides = readSeriesSpecOverrides(rootDir);
  const map = new Map<string, SeriesSpec>();
  const baseSpecs = legacy.status === "loaded" ? legacy.specs : INDICATOR_SERIES_SPECS;
  for (const row of baseSpecs) {
    const spec = canonicalizeSpec(row);
    map.set(spec.id, spec);
  }
  for (const row of overrides.specs) {
    const spec = canonicalizeSpec(row);
    if (!sourceMap.has(spec.sourceId)) {
      throw new IndicatorConfigError(
        "INVALID_RUNTIME_OVERRIDES",
        "지표 runtime override의 sourceId를 찾을 수 없습니다: " + spec.sourceId,
      );
    }
    map.set(spec.id, spec);
  }

  return {
    baseSource: legacy.status === "loaded" ? "legacy-compat" : "built-in",
    sources: [...sourceMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    specs: [...map.values()].sort((a, b) => a.id.localeCompare(b.id)),
    runtimeOverrideCount: overrides.specs.length,
  };
}

export function loadEffectiveSeriesSpecs(
  rootDir = defaultRootDir(),
  cwd = process.cwd(),
): SeriesSpec[] {
  return loadEffectiveIndicatorConfig({ rootDir, cwd }).specs;
}

export function exportSeriesSpecList(rootDir?: string, cwd = process.cwd()): SeriesSpec[] {
  return loadEffectiveSeriesSpecs(rootDir, cwd)
    .map((row) => SeriesSpecSchema.parse(row))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildPreviewRows(
  items: unknown[],
  rootDir = defaultRootDir(),
  cwd = process.cwd(),
): IndicatorSpecsImportPreview {
  const effective = loadEffectiveIndicatorConfig({ rootDir, cwd });
  const sourceIds = new Set(effective.sources.map((row) => row.id));
  const issues: ImportIssue[] = [];
  const rows: PreviewRow[] = [];
  const specs: SeriesSpec[] = [];
  const seenIds = new Set<string>();
  const defaultIds = new Set(effective.specs.map((row) => normalizeSeriesId(row.id)));
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

export function previewImportSeriesSpecs(
  items: unknown[],
  rootDir = defaultRootDir(),
  cwd = process.cwd(),
): IndicatorSpecsImportPreview {
  return buildPreviewRows(items, rootDir, cwd);
}

export function applyImportSeriesSpecs(
  items: unknown[],
  rootDir = defaultRootDir(),
  cwd = process.cwd(),
): IndicatorSpecsImportApplyResult {
  const preview = buildPreviewRows(items, rootDir, cwd);
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
    effectiveCount: loadEffectiveSeriesSpecs(rootDir, cwd).length,
  });
}
