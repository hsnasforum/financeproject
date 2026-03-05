import fs from "node:fs";
import path from "node:path";
import {
  NewsCustomSourceSchema,
  NewsSettingsSchema,
  NewsSourceSchema,
  NewsTopicSchema,
  type NewsSettings,
  type NewsSource,
  type NewsTopic,
} from "./contracts";
import { NEWS_SOURCES } from "./sources";
import { NEWS_TOPICS, canonicalizeTopicId } from "./taxonomy";
import { parseWithV3Whitelist } from "../security/whitelist";

const DEFAULT_SETTINGS: NewsSettings = {
  schemaVersion: 1,
  updatedAt: undefined,
  sources: [],
  topics: [],
  customSources: [],
};

const DEFAULT_NEWS_ROOT = path.join(process.cwd(), ".data", "news");

function dedupeKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = value.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function resolveNewsSettingsPath(rootDir = DEFAULT_NEWS_ROOT): string {
  return path.join(rootDir, "settings.json");
}

export function readNewsSettings(rootDir = DEFAULT_NEWS_ROOT): NewsSettings {
  const filePath = resolveNewsSettingsPath(rootDir);
  if (!fs.existsSync(filePath)) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return NewsSettingsSchema.parse(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeNewsSettings(input: NewsSettings, rootDir = DEFAULT_NEWS_ROOT): NewsSettings {
  const next = parseWithV3Whitelist(NewsSettingsSchema, {
    schemaVersion: 1,
    ...input,
    updatedAt: new Date().toISOString(),
  }, {
    scope: "persistence",
    context: "news.settings",
  });

  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(resolveNewsSettingsPath(rootDir), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

export function mergeSourcesWithOverrides(
  defaults: NewsSource[] = NEWS_SOURCES,
  settings: NewsSettings = DEFAULT_SETTINGS,
): NewsSource[] {
  const byId = new Map(settings.sources.map((row) => [row.id, row]));
  const mergedDefaults = defaults.map((source) => {
    const override = byId.get(source.id);
    return NewsSourceSchema.parse({
      ...source,
      enabled: typeof override?.enabled === "boolean" ? override.enabled : source.enabled,
      weight: Number.isFinite(override?.weight) ? Number(override?.weight) : source.weight,
    });
  });

  const existingIds = new Set(mergedDefaults.map((row) => row.id));
  const existingUrls = new Set(mergedDefaults.map((row) => row.feedUrl));
  const customMerged: NewsSource[] = [];
  for (const row of settings.customSources ?? []) {
    const custom = NewsCustomSourceSchema.parse(row);
    if (existingIds.has(custom.id)) continue;
    if (existingUrls.has(custom.feedUrl)) continue;
    const override = byId.get(custom.id);
    customMerged.push(NewsSourceSchema.parse({
      id: custom.id,
      name: custom.name,
      feedUrl: custom.feedUrl,
      homepageUrl: custom.homepageUrl,
      country: custom.country,
      language: custom.language,
      weight: Number.isFinite(override?.weight) ? Number(override?.weight) : custom.weight,
      enabled: typeof override?.enabled === "boolean" ? override.enabled : custom.enabled,
    }));
    existingIds.add(custom.id);
    existingUrls.add(custom.feedUrl);
  }

  return [...mergedDefaults, ...customMerged];
}

export function mergeTopicsWithOverrides(
  defaults: NewsTopic[] = NEWS_TOPICS,
  settings: NewsSettings = DEFAULT_SETTINGS,
): NewsTopic[] {
  const byId = new Map(
    settings.topics.map((row) => [canonicalizeTopicId(row.id), row]),
  );
  return defaults.map((topic) => {
    const override = byId.get(canonicalizeTopicId(topic.id));
    const keywords = Array.isArray(override?.keywords)
      ? dedupeKeywords(override.keywords)
      : topic.keywords;

    return NewsTopicSchema.parse({
      ...topic,
      keywords,
    });
  });
}

export function loadEffectiveNewsConfig(rootDir = DEFAULT_NEWS_ROOT): {
  settings: NewsSettings;
  sources: NewsSource[];
  topics: NewsTopic[];
} {
  const settings = readNewsSettings(rootDir);
  return {
    settings,
    sources: mergeSourcesWithOverrides(NEWS_SOURCES, settings),
    topics: mergeTopicsWithOverrides(NEWS_TOPICS, settings),
  };
}
