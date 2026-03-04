import { z } from "zod";

export const NewsEntitySchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).min(1),
  topicHints: z.array(z.string().trim().min(1)).default([]),
});

export type NewsEntity = z.infer<typeof NewsEntitySchema>;

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/[\s\-./]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+/#\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

const RAW_ENTITIES = [
  {
    id: "central_bank_fed",
    label: "미국 연방준비제도",
    aliases: ["federal reserve", "fed", "fomc", "연준"],
    topicHints: ["rates"],
  },
  {
    id: "central_bank_bok",
    label: "한국은행",
    aliases: ["한국은행", "bank of korea", "bok", "금통위"],
    topicHints: ["rates"],
  },
  {
    id: "currency_usdkrw",
    label: "원달러 환율",
    aliases: ["usdkrw", "usd/krw", "원달러", "달러원"],
    topicHints: ["fx"],
  },
  {
    id: "index_dxy",
    label: "달러인덱스",
    aliases: ["dxy", "dollar index"],
    topicHints: ["fx"],
  },
  {
    id: "commodity_wti",
    label: "WTI 원유",
    aliases: ["wti", "west texas intermediate", "서부텍사스유"],
    topicHints: ["commodities"],
  },
  {
    id: "commodity_brent",
    label: "브렌트유",
    aliases: ["brent", "브렌트유"],
    topicHints: ["commodities"],
  },
  {
    id: "cartel_opec_plus",
    label: "OPEC+",
    aliases: ["opec+", "opec plus", "opec"],
    topicHints: ["commodities"],
  },
  {
    id: "agency_moef",
    label: "기획재정부",
    aliases: ["moef", "기획재정부", "ministry of economy and finance"],
    topicHints: ["fiscal"],
  },
  {
    id: "agency_kosis",
    label: "KOSIS",
    aliases: ["kosis", "통계청", "statistics korea"],
    topicHints: ["growth", "labor"],
  },
] as const;

export const NEWS_ENTITY_DICT: NewsEntity[] = RAW_ENTITIES.map((row) => NewsEntitySchema.parse({
  id: toSnakeCase(row.id),
  label: row.label.trim(),
  aliases: dedupe(row.aliases.map((alias) => normalizeAlias(alias))),
  topicHints: dedupe(row.topicHints.map((topicId) => topicId.trim().toLowerCase())),
}));

const ENTITY_BY_ID = new Map(NEWS_ENTITY_DICT.map((row) => [row.id, row] as const));

const ALIAS_TO_ID = (() => {
  const map = new Map<string, string>();
  for (const entity of NEWS_ENTITY_DICT) {
    map.set(entity.id, entity.id);
    for (const alias of entity.aliases) {
      if (!map.has(alias)) {
        map.set(alias, entity.id);
      }
    }
  }
  return map;
})();

export function normalizeEntityAlias(value: string): string {
  return normalizeAlias(value);
}

export function normalizeEntityId(value: string): string {
  const normalized = normalizeAlias(value);
  const direct = ALIAS_TO_ID.get(normalized);
  if (direct) return direct;
  const snake = toSnakeCase(normalized);
  return ALIAS_TO_ID.get(snake) ?? "";
}

export function getEntityTopicHints(entityId: string): string[] {
  const normalized = normalizeEntityId(entityId);
  if (!normalized) return [];
  return [...(ENTITY_BY_ID.get(normalized)?.topicHints ?? [])];
}
