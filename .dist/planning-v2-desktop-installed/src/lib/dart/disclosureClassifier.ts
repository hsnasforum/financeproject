import fs from "node:fs";

export type DisclosureCategoryRule = {
  id: string;
  label: string;
  baseScore: number;
  patterns: string[];
};

export type DisclosureBoosterRule = {
  pattern: string;
  delta: number;
};

export type DisclosureThresholds = {
  high: number;
  mid: number;
};

export type DisclosureNormalizationRules = {
  prefixes: string[];
  suffixes: string[];
  noise: string[];
};

export type DisclosureClusteringRules = {
  windowDays: number;
  minTokenOverlap: number;
  maxClusterSize: number;
};

export type DisclosureRules = {
  categories: DisclosureCategoryRule[];
  boosters: DisclosureBoosterRule[];
  thresholds: DisclosureThresholds;
  maxHighlightsPerCorp: number;
  normalization: DisclosureNormalizationRules;
  clustering: DisclosureClusteringRules;
};

export type DisclosureClassifyInput = {
  reportName?: string;
  report_nm?: string;
  [key: string]: unknown;
};

export type DisclosureLevel = "high" | "mid" | "low";

export type DisclosureClassification = {
  categoryId: string;
  categoryLabel: string;
  score: number;
  level: DisclosureLevel;
  signals: string[];
  reason: string;
};

type RulesValidationResult = {
  ok: boolean;
  issues: string[];
  rules: DisclosureRules;
};

const DEFAULT_FALLBACK_CATEGORY: DisclosureCategoryRule = {
  id: "other",
  label: "기타",
  baseScore: 40,
  patterns: [],
};

const DEFAULT_RULES: DisclosureRules = {
  categories: [DEFAULT_FALLBACK_CATEGORY],
  boosters: [],
  thresholds: {
    high: 85,
    mid: 60,
  },
  maxHighlightsPerCorp: 5,
  normalization: {
    prefixes: [],
    suffixes: [],
    noise: [],
  },
  clustering: {
    windowDays: 10,
    minTokenOverlap: 0.34,
    maxClusterSize: 8,
  },
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toText(value: unknown): string {
  return asString(value).toLowerCase();
}

function toSafeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toSafeFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(asString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function normalizeCategory(value: unknown): DisclosureCategoryRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const id = asString(input.id);
  const label = asString(input.label);
  if (!id || !label) return null;

  const baseScore = toSafeInt(input.baseScore, 50, 0, 100);
  const patternsRaw = Array.isArray(input.patterns) ? input.patterns : [];
  const patterns = [...new Set(patternsRaw.map(asString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  if (patterns.length === 0) return null;
  return {
    id,
    label,
    baseScore,
    patterns,
  };
}

function normalizeBooster(value: unknown): DisclosureBoosterRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const pattern = asString(input.pattern);
  if (!pattern) return null;
  const delta = toSafeInt(input.delta, 0, -100, 100);
  return {
    pattern,
    delta,
  };
}

function normalizeRules(raw: unknown): RulesValidationResult {
  const issues: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push("rules root must be an object");
    return {
      ok: false,
      issues,
      rules: DEFAULT_RULES,
    };
  }

  const input = raw as Record<string, unknown>;
  const categoriesInput = Array.isArray(input.categories) ? input.categories : [];
  const boostersInput = Array.isArray(input.boosters) ? input.boosters : [];
  const categories = categoriesInput
    .map((row) => normalizeCategory(row))
    .filter((row): row is DisclosureCategoryRule => row !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  const boosters = boostersInput
    .map((row) => normalizeBooster(row))
    .filter((row): row is DisclosureBoosterRule => row !== null)
    .sort((a, b) => a.pattern.localeCompare(b.pattern));

  if (categories.length === 0) {
    issues.push("categories must include at least one valid category with patterns");
  }

  const thresholdsInput =
    input.thresholds && typeof input.thresholds === "object" && !Array.isArray(input.thresholds)
      ? (input.thresholds as Record<string, unknown>)
      : {};
  const high = toSafeInt(thresholdsInput.high, 85, 1, 100);
  const mid = toSafeInt(thresholdsInput.mid, 60, 0, 100);
  if (high <= mid) {
    issues.push("thresholds.high must be greater than thresholds.mid");
  }

  const maxHighlightsPerCorp = toSafeInt(input.maxHighlightsPerCorp, 5, 1, 20);
  const normalizationInput =
    input.normalization && typeof input.normalization === "object" && !Array.isArray(input.normalization)
      ? (input.normalization as Record<string, unknown>)
      : {};
  const clusteringInput =
    input.clustering && typeof input.clustering === "object" && !Array.isArray(input.clustering)
      ? (input.clustering as Record<string, unknown>)
      : {};

  const normalization = {
    prefixes: normalizeStringArray(normalizationInput.prefixes),
    suffixes: normalizeStringArray(normalizationInput.suffixes),
    noise: normalizeStringArray(normalizationInput.noise),
  };
  const clustering = {
    windowDays: toSafeInt(clusteringInput.windowDays, DEFAULT_RULES.clustering.windowDays, 1, 90),
    minTokenOverlap: toSafeFloat(clusteringInput.minTokenOverlap, DEFAULT_RULES.clustering.minTokenOverlap, 0, 1),
    maxClusterSize: toSafeInt(clusteringInput.maxClusterSize, DEFAULT_RULES.clustering.maxClusterSize, 1, 50),
  };

  return {
    ok: issues.length === 0,
    issues,
    rules: {
      categories: categories.length > 0 ? categories : DEFAULT_RULES.categories,
      boosters,
      thresholds: {
        high,
        mid,
      },
      maxHighlightsPerCorp,
      normalization,
      clustering,
    },
  };
}

export function validateRulesConfig(raw: unknown): RulesValidationResult {
  return normalizeRules(raw);
}

export function loadRules(filePath: string): DisclosureRules {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  const normalized = normalizeRules(raw);
  if (!normalized.ok) {
    throw new Error(`invalid disclosure rules: ${normalized.issues.join("; ")}`);
  }
  return normalized.rules;
}

function scoreToLevel(score: number, thresholds: DisclosureThresholds): DisclosureLevel {
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.mid) return "mid";
  return "low";
}

function pickBestCategory(reportText: string, categories: DisclosureCategoryRule[]): {
  category: DisclosureCategoryRule;
  categoryScore: number;
  categorySignals: string[];
  categoryReason: string;
} {
  const matches = categories.map((category) => {
    const matchedPatterns = category.patterns.filter((pattern) => reportText.includes(toText(pattern)));
    const categoryScore = matchedPatterns.length > 0
      ? Math.min(100, category.baseScore + (matchedPatterns.length - 1) * 3)
      : -1;
    return {
      category,
      categoryScore,
      matchedPatterns,
    };
  });

  const found = matches
    .filter((row) => row.categoryScore >= 0)
    .sort((a, b) => {
      if (a.categoryScore !== b.categoryScore) return b.categoryScore - a.categoryScore;
      return a.category.id.localeCompare(b.category.id);
    })[0];

  if (!found) {
    return {
      category: DEFAULT_FALLBACK_CATEGORY,
      categoryScore: DEFAULT_FALLBACK_CATEGORY.baseScore,
      categorySignals: [],
      categoryReason: "no category pattern matched",
    };
  }

  return {
    category: found.category,
    categoryScore: found.categoryScore,
    categorySignals: found.matchedPatterns.map((pattern) => `category:${found.category.id}:${pattern}`),
    categoryReason: found.matchedPatterns.join(", "),
  };
}

function scoreBoosters(reportText: string, boosters: DisclosureBoosterRule[]): {
  delta: number;
  signals: string[];
} {
  let delta = 0;
  const signals: string[] = [];

  for (const booster of boosters) {
    if (!reportText.includes(toText(booster.pattern))) continue;
    delta += booster.delta;
    signals.push(`booster:${booster.pattern}:${booster.delta >= 0 ? "+" : ""}${booster.delta}`);
  }

  return {
    delta,
    signals,
  };
}

export function classify(item: DisclosureClassifyInput, rules: DisclosureRules): DisclosureClassification {
  const reportName = asString(item.reportName ?? item.report_nm);
  const reportText = toText(reportName);

  const best = pickBestCategory(reportText, rules.categories);
  const booster = scoreBoosters(reportText, rules.boosters);
  const score = Math.max(0, Math.min(100, best.categoryScore + booster.delta));
  const level = scoreToLevel(score, rules.thresholds);
  const signals = [...best.categorySignals, ...booster.signals].sort((a, b) => a.localeCompare(b));

  return {
    categoryId: best.category.id,
    categoryLabel: best.category.label,
    score,
    level,
    signals,
    reason: reportName
      ? `${best.category.label}; matched=${best.categoryReason || "none"}; booster=${booster.delta}`
      : `${best.category.label}; report title missing`,
  };
}
