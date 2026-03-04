import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseWithV3Whitelist } from "../security/whitelist";
import { TopicScenarioTemplateSchema, type TopicScenarioTemplate } from "../news/scenario/contracts";

export const ScenarioLibraryEntrySchema = TopicScenarioTemplateSchema.extend({
  enabled: z.boolean().default(true),
  order: z.number().int().nonnegative(),
});
export type ScenarioLibraryEntry = z.infer<typeof ScenarioLibraryEntrySchema>;

export const ScenarioLibraryOverrideItemSchema = z.object({
  topicId: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
});
export type ScenarioLibraryOverrideItem = z.infer<typeof ScenarioLibraryOverrideItemSchema>;

export const ScenarioLibraryOverridesSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  updatedAt: z.string().datetime().optional(),
  items: z.array(ScenarioLibraryOverrideItemSchema).default([]),
});
export type ScenarioLibraryOverrides = z.infer<typeof ScenarioLibraryOverridesSchema>;

type ScenarioTemplateSeed = Omit<ScenarioLibraryEntry, "enabled" | "order">;

const RAW_SCENARIO_LIBRARY_SSOT: ScenarioTemplateSeed[] = [
  {
    topicId: "rates",
    topicLabel: "금리",
    observation: {
      base: "관찰: 금리 관련 보도 강도가 현재 수준으로 이어질 경우 민감도 유지 가능성이 있습니다.",
      bull: "관찰: 금리 관련 보도 강도가 완화될 경우 긴장 완화 흐름으로 해석될 수 있습니다.",
      bear: "관찰: 금리 관련 보도 강도가 강화될 경우 변동성 확대 구간으로 이어질 수 있습니다.",
    },
    invalidation: {
      base: ["금리 토픽 기사 집중이 빠르게 분산되면 현재 관찰의 설명력은 약화될 수 있습니다."],
      bull: ["금리 토픽 급증이 재확대되면 완화 가정은 약화될 수 있습니다."],
      bear: ["금리 토픽 강도가 완화되면 강화 가정은 재평가될 수 있습니다."],
    },
    options: {
      base: ["옵션: 금리 토픽의 기사 강도와 다양성 변화를 같은 주기로 점검합니다."],
      bull: ["옵션: 완화 신호가 이어지는지 조건부로 점검 목록을 유지합니다."],
      bear: ["옵션: 강화 신호가 누적되는지 관찰 빈도를 높여 병행 점검합니다."],
    },
  },
  {
    topicId: "inflation",
    topicLabel: "물가",
    observation: {
      base: "관찰: 물가 관련 이슈가 유지되는 구간에서는 비용 압력 해석이 이어질 수 있습니다.",
      bull: "관찰: 물가 관련 강도가 둔화되는 구간에서는 압력 완화 가능성을 조건부로 볼 수 있습니다.",
      bear: "관찰: 물가 관련 강도가 재확대되는 구간에서는 상방 압력 재부각 가능성이 있습니다.",
    },
    invalidation: {
      base: ["물가 토픽 대비 반대 시그널이 늘어나면 현재 관찰은 약화될 수 있습니다."],
      bull: ["물가 토픽 급증이 다시 강화되면 둔화 가정은 약화될 수 있습니다."],
      bear: ["물가 토픽 집중이 완화되면 강화 가정은 재점검될 수 있습니다."],
    },
    options: {
      base: ["옵션: 물가·원자재 토픽의 동조 여부를 확인하는 체크리스트를 유지합니다."],
      bull: ["옵션: 완화 신호의 지속성과 반대 시그널 동반 여부를 함께 점검합니다."],
      bear: ["옵션: 강화 신호 누적 시 관찰 지표 범위를 넓혀 병행 확인합니다."],
    },
  },
  {
    topicId: "fx",
    topicLabel: "환율",
    observation: {
      base: "관찰: 환율 관련 신호가 유지될 경우 대외 변수 민감도는 이어질 수 있습니다.",
      bull: "관찰: 환율 관련 신호가 완화될 경우 단기 압력은 제한될 수 있습니다.",
      bear: "관찰: 환율 관련 신호가 강화될 경우 변동 구간 확대 가능성이 있습니다.",
    },
    invalidation: {
      base: ["환율 토픽 집중이 낮아지면 현재 관찰의 강도는 약화될 수 있습니다."],
      bull: ["환율 토픽이 다시 급증하면 완화 가정은 보수적으로 조정될 수 있습니다."],
      bear: ["환율 토픽 강도가 둔화되면 강화 시나리오는 재검토될 수 있습니다."],
    },
    options: {
      base: ["옵션: 환율 토픽 기사량과 소스 분포를 함께 점검합니다."],
      bull: ["옵션: 완화 신호가 유지되는지 확인 주기를 유지합니다."],
      bear: ["옵션: 강화 신호가 반복되는지 관찰 축을 확장해 점검합니다."],
    },
  },
  {
    topicId: "general",
    topicLabel: "핵심",
    observation: {
      base: "관찰: 핵심 토픽 신호가 현재 수준에서 유지되는 흐름으로 관찰됩니다.",
      bull: "관찰: 핵심 토픽 신호가 완화되는 흐름으로 전환될 가능성이 있습니다.",
      bear: "관찰: 핵심 토픽 신호가 강화되는 흐름으로 확장될 가능성이 있습니다.",
    },
    invalidation: {
      base: ["토픽 분산이 빠르게 진행되면 현재 가정은 약화될 수 있습니다."],
      bull: ["신호 재확대가 동반되면 완화 가정은 재평가될 수 있습니다."],
      bear: ["신호 완화가 확인되면 강화 가정은 약화될 수 있습니다."],
    },
    options: {
      base: ["옵션: 핵심 토픽의 지속성과 분산 정도를 함께 점검합니다."],
      bull: ["옵션: 완화 흐름의 연속성 여부를 조건부로 확인합니다."],
      bear: ["옵션: 강화 흐름의 누적 여부를 병행 점검합니다."],
    },
  },
];

export const SCENARIO_LIBRARY_SSOT: ScenarioLibraryEntry[] = RAW_SCENARIO_LIBRARY_SSOT
  .map((row, index) => ScenarioLibraryEntrySchema.parse({
    ...row,
    enabled: true,
    order: index,
  }));

const DEFAULT_DATA_DIR = path.join(process.cwd(), ".data", "scenarios");

function defaultOverrides(): ScenarioLibraryOverrides {
  return ScenarioLibraryOverridesSchema.parse({
    schemaVersion: 1,
    updatedAt: undefined,
    items: [],
  });
}

function normalizeTopicId(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeOverrides(items: ScenarioLibraryOverrideItem[]): ScenarioLibraryOverrideItem[] {
  const map = new Map<string, ScenarioLibraryOverrideItem>();
  for (const row of items) {
    const topicId = normalizeTopicId(row.topicId);
    if (!topicId) continue;
    map.set(topicId, ScenarioLibraryOverrideItemSchema.parse({
      topicId,
      enabled: typeof row.enabled === "boolean" ? row.enabled : undefined,
      order: Number.isInteger(row.order) ? row.order : undefined,
    }));
  }
  return [...map.values()].sort((a, b) => a.topicId.localeCompare(b.topicId));
}

export function resolveScenarioOverridesPath(dataDir = DEFAULT_DATA_DIR): string {
  return path.join(dataDir, "overrides.json");
}

export function readScenarioLibraryOverrides(dataDir = DEFAULT_DATA_DIR): ScenarioLibraryOverrides {
  const filePath = resolveScenarioOverridesPath(dataDir);
  if (!fs.existsSync(filePath)) return defaultOverrides();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return ScenarioLibraryOverridesSchema.parse(parsed);
  } catch {
    return defaultOverrides();
  }
}

export function writeScenarioLibraryOverrides(
  input: Pick<ScenarioLibraryOverrides, "items">,
  dataDir = DEFAULT_DATA_DIR,
): ScenarioLibraryOverrides {
  const next = parseWithV3Whitelist(ScenarioLibraryOverridesSchema, {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items: dedupeOverrides(input.items ?? []),
  }, {
    scope: "persistence",
    context: "scenarios.library.overrides",
  });

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(resolveScenarioOverridesPath(dataDir), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

export function mergeScenarioLibraryWithOverrides(
  ssot: ScenarioLibraryEntry[] = SCENARIO_LIBRARY_SSOT,
  overrides: ScenarioLibraryOverrides = defaultOverrides(),
): ScenarioLibraryEntry[] {
  const overrideByTopic = new Map(
    dedupeOverrides(overrides.items ?? []).map((row) => [normalizeTopicId(row.topicId), row] as const),
  );

  const merged = ssot.map((entry, index) => {
    const override = overrideByTopic.get(normalizeTopicId(entry.topicId));
    return ScenarioLibraryEntrySchema.parse({
      ...entry,
      enabled: typeof override?.enabled === "boolean" ? override.enabled : entry.enabled,
      order: typeof override?.order === "number" && Number.isFinite(override.order) ? override.order : entry.order ?? index,
    });
  });

  return merged
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.topicId.localeCompare(b.topicId);
    })
    .map((entry, index) => ScenarioLibraryEntrySchema.parse({
      ...entry,
      order: index,
    }));
}

function toTopicTemplate(entry: ScenarioLibraryEntry): TopicScenarioTemplate {
  return TopicScenarioTemplateSchema.parse({
    topicId: entry.topicId,
    topicLabel: entry.topicLabel,
    observation: entry.observation,
    invalidation: entry.invalidation,
    options: entry.options,
  });
}

export function loadEffectiveScenarioLibrary(dataDir = DEFAULT_DATA_DIR): {
  updatedAt: string | null;
  entries: ScenarioLibraryEntry[];
  templates: TopicScenarioTemplate[];
} {
  const overrides = readScenarioLibraryOverrides(dataDir);
  const entries = mergeScenarioLibraryWithOverrides(SCENARIO_LIBRARY_SSOT, overrides);
  const templates = entries.filter((row) => row.enabled).map(toTopicTemplate);

  return {
    updatedAt: overrides.updatedAt ?? null,
    entries,
    templates: templates.length > 0
      ? templates
      : SCENARIO_LIBRARY_SSOT.map(toTopicTemplate),
  };
}
