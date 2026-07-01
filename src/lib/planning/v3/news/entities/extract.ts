import {
  NEWS_ENTITY_DICT,
  getEntityTopicHints,
  normalizeEntityAlias,
  normalizeEntityId,
} from "./dict";

type EntityExtractInput = {
  title?: string;
  snippet?: string;
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+/#\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAsciiAlias(value: string): boolean {
  return /^[a-z0-9+/# ]+$/.test(value);
}

function hasAlias(text: string, alias: string): boolean {
  if (!text || !alias) return false;
  if (isAsciiAlias(alias)) {
    const paddedText = ` ${text} `;
    const paddedAlias = ` ${alias} `;
    return paddedText.includes(paddedAlias);
  }
  return text.includes(alias);
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

export function normalizeEntityIds(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  const normalized = values
    .map((value) => normalizeEntityId(value))
    .filter((value) => value.length > 0);
  return dedupe(normalized).sort((a, b) => a.localeCompare(b));
}

export function extractEntities(input: EntityExtractInput): string[] {
  const text = normalizeText(`${input.title ?? ""} ${input.snippet ?? ""}`);
  if (!text) return [];

  const out: string[] = [];
  for (const entity of NEWS_ENTITY_DICT) {
    const matched = entity.aliases.some((alias) => hasAlias(text, normalizeEntityAlias(alias)));
    if (!matched) continue;
    out.push(entity.id);
  }

  return out;
}

export function buildTopicEntityMap(entityIds: string[] | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const entityId of normalizeEntityIds(entityIds)) {
    for (const topicId of getEntityTopicHints(entityId)) {
      const bucket = out[topicId] ?? [];
      bucket.push(entityId);
      out[topicId] = bucket;
    }
  }

  for (const topicId of Object.keys(out)) {
    out[topicId] = dedupe(out[topicId]).sort((a, b) => a.localeCompare(b));
  }
  return out;
}
