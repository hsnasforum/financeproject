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
import { NEWS_SOURCES, RETIRED_NEWS_SOURCES } from "./sources";
import { NEWS_TOPICS, canonicalizeTopicId } from "./taxonomy";
import { resolveNewsRootDir } from "./rootDir";
import { parseWithV3Whitelist } from "../security/whitelist";
import { validateFeedUrlSyntax } from "./ingest/fetchFeed";

const DEFAULT_SETTINGS: NewsSettings = {
  schemaVersion: 1,
  updatedAt: undefined,
  sources: [],
  topics: [],
  customSources: [],
};

const RETIRED_CUSTOM_SOURCE_REASON = "안전한 HTTPS 피드가 아니어서 비활성화했습니다. HTTPS 주소로 다시 등록해 주세요.";

function quarantineUnsafeCustomSources(settings: NewsSettings): NewsSettings {
  return {
    ...settings,
    customSources: settings.customSources.map((source) => validateFeedUrlSyntax(source.feedUrl).ok
      ? source
      : { ...source, enabled: false }),
  };
}

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

export function resolveNewsSettingsPath(rootDir = resolveNewsRootDir()): string {
  return path.join(rootDir, "settings.json");
}

export function readNewsSettings(rootDir = resolveNewsRootDir()): NewsSettings {
  const filePath = resolveNewsSettingsPath(rootDir);
  if (!fs.existsSync(filePath)) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return quarantineUnsafeCustomSources(NewsSettingsSchema.parse(parsed));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeNewsSettings(input: NewsSettings, rootDir = resolveNewsRootDir()): NewsSettings {
  const parsed = parseWithV3Whitelist(NewsSettingsSchema, {
    schemaVersion: 1,
    ...input,
    updatedAt: new Date().toISOString(),
  }, {
    scope: "persistence",
    context: "news.settings",
  });
  const next = quarantineUnsafeCustomSources(parsed);

  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(resolveNewsSettingsPath(rootDir), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

export function mergeSourcesWithOverrides(
  defaults: NewsSource[] = NEWS_SOURCES,
  settings: NewsSettings = DEFAULT_SETTINGS,
): NewsSource[] {
  const byId = new Map(settings.sources.map((row) => [row.id, row]));
  const defaultIds = new Set(defaults.map((source) => source.id));
  const allDefaults = [
    ...defaults,
    ...RETIRED_NEWS_SOURCES.filter((source) => !defaultIds.has(source.id)),
  ];
  const mergedDefaults = allDefaults.map((source) => {
    const override = byId.get(source.id);
    return NewsSourceSchema.parse({
      ...source,
      enabled: source.retiredReason
        ? false
        : typeof override?.enabled === "boolean" ? override.enabled : source.enabled,
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
    const retiredReason = validateFeedUrlSyntax(custom.feedUrl).ok
      ? undefined
      : RETIRED_CUSTOM_SOURCE_REASON;
    customMerged.push(NewsSourceSchema.parse({
      id: custom.id,
      name: custom.name,
      feedUrl: custom.feedUrl,
      homepageUrl: custom.homepageUrl,
      country: custom.country,
      language: custom.language,
      weight: Number.isFinite(override?.weight) ? Number(override?.weight) : custom.weight,
      enabled: retiredReason
        ? false
        : typeof override?.enabled === "boolean" ? override.enabled : custom.enabled,
      retiredReason,
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

export function loadEffectiveNewsConfig(rootDir = resolveNewsRootDir()): {
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
