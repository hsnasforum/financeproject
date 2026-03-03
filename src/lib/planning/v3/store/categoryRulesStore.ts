import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type CategoryId, type CategoryRule } from "../domain/types";

type RulesState = {
  version: 1;
  items: CategoryRule[];
};

type UpsertRuleInput = {
  id?: unknown;
  categoryId: unknown;
  match: unknown;
  priority?: unknown;
  enabled?: unknown;
  note?: unknown;
};

const ALLOWED_CATEGORY_IDS = new Set<CategoryId>([
  "income",
  "transfer",
  "fixed",
  "variable",
  "debt",
  "tax",
  "insurance",
  "housing",
  "food",
  "transport",
  "shopping",
  "health",
  "education",
  "etc",
  "unknown",
]);

const DEFAULT_RULES: CategoryRule[] = [
  { id: "income-salary-ko", categoryId: "income", match: { type: "contains", value: "급여" }, priority: 100, enabled: true },
  { id: "income-salary-en", categoryId: "income", match: { type: "contains", value: "salary" }, priority: 100, enabled: true },
  { id: "transfer-ko", categoryId: "transfer", match: { type: "contains", value: "이체" }, priority: 95, enabled: true },
  { id: "transfer-en", categoryId: "transfer", match: { type: "contains", value: "transfer" }, priority: 95, enabled: true },
  { id: "housing-rent-ko", categoryId: "housing", match: { type: "contains", value: "월세" }, priority: 90, enabled: true },
  { id: "housing-rent-en", categoryId: "housing", match: { type: "contains", value: "rent" }, priority: 90, enabled: true },
  { id: "insurance-ko", categoryId: "insurance", match: { type: "contains", value: "보험" }, priority: 88, enabled: true },
  { id: "insurance-en", categoryId: "insurance", match: { type: "contains", value: "insurance" }, priority: 88, enabled: true },
  { id: "food-ko", categoryId: "food", match: { type: "contains", value: "식" }, priority: 80, enabled: true },
  { id: "food-en", categoryId: "food", match: { type: "contains", value: "food" }, priority: 80, enabled: true },
  { id: "transport-ko", categoryId: "transport", match: { type: "contains", value: "교통" }, priority: 75, enabled: true },
  { id: "transport-en", categoryId: "transport", match: { type: "contains", value: "transport" }, priority: 75, enabled: true },
  { id: "shopping-ko", categoryId: "shopping", match: { type: "contains", value: "쇼핑" }, priority: 70, enabled: true },
  { id: "shopping-en", categoryId: "shopping", match: { type: "contains", value: "shopping" }, priority: 70, enabled: true },
];

export class CategoryRulesStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "CategoryRulesStoreInputError";
    this.details = details;
  }
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 category rules store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asInteger(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveRulesPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_CATEGORY_RULES_PATH);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "planning-v3", "category-rules.json");
}

function normalizeCategoryId(value: unknown): CategoryId {
  const categoryId = asString(value).toLowerCase() as CategoryId;
  if (!ALLOWED_CATEGORY_IDS.has(categoryId)) {
    throw new CategoryRulesStoreInputError("invalid categoryId", [
      { field: "categoryId", message: "지원하지 않는 categoryId 입니다." },
    ]);
  }
  return categoryId;
}

function normalizeRuleId(value: unknown): string {
  const text = asString(value);
  if (!text) {
    throw new CategoryRulesStoreInputError("invalid id", [
      { field: "id", message: "rule id가 필요합니다." },
    ]);
  }
  try {
    return sanitizeRecordId(text);
  } catch {
    throw new CategoryRulesStoreInputError("invalid id", [
      { field: "id", message: "rule id 형식이 올바르지 않습니다." },
    ]);
  }
}

function normalizeMatch(value: unknown): { type: "contains"; value: string } {
  if (!isRecord(value) || asString(value.type) !== "contains") {
    throw new CategoryRulesStoreInputError("invalid match", [
      { field: "match", message: "match.type은 contains만 지원합니다." },
    ]);
  }
  const matchValue = asString(value.value);
  if (matchValue.length < 1 || matchValue.length > 50) {
    throw new CategoryRulesStoreInputError("invalid match value", [
      { field: "match.value", message: "contains 키워드는 1~50자여야 합니다." },
    ]);
  }
  return { type: "contains", value: matchValue };
}

function normalizeRule(value: unknown): CategoryRule | null {
  if (!isRecord(value)) return null;
  try {
    const id = normalizeRuleId(value.id);
    const categoryId = normalizeCategoryId(value.categoryId);
    const match = normalizeMatch(value.match);
    const priority = asInteger(value.priority, 0);
    const enabled = value.enabled !== false;
    const note = asString(value.note);
    return {
      id,
      categoryId,
      match,
      priority,
      enabled,
      ...(note ? { note: note.slice(0, 120) } : {}),
    };
  } catch {
    return null;
  }
}

function sortRules(rows: CategoryRule[]): CategoryRule[] {
  return [...rows].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.id.localeCompare(right.id);
  });
}

async function readState(): Promise<RulesState> {
  try {
    const parsed = JSON.parse(await fs.readFile(resolveRulesPath(), "utf-8")) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return { version: 1, items: sortRules(DEFAULT_RULES) };
    }
    const items = parsed.items
      .map((row) => normalizeRule(row))
      .filter((row): row is CategoryRule => row !== null);
    return {
      version: 1,
      items: items.length > 0 ? sortRules(items) : sortRules(DEFAULT_RULES),
    };
  } catch {
    return { version: 1, items: sortRules(DEFAULT_RULES) };
  }
}

async function writeState(state: RulesState): Promise<void> {
  await atomicWriteJson(resolveRulesPath(), {
    version: 1,
    items: sortRules(state.items),
  });
}

export async function listRules(): Promise<CategoryRule[]> {
  assertServerOnly();
  const state = await readState();
  return sortRules(state.items);
}

export async function upsertRule(input: UpsertRuleInput): Promise<CategoryRule> {
  assertServerOnly();
  const state = await readState();

  const categoryId = normalizeCategoryId(input.categoryId);
  const match = normalizeMatch(input.match);
  const priority = asInteger(input.priority, 0);
  const enabled = input.enabled !== false;
  const note = asString(input.note);
  const id = asString(input.id) ? normalizeRuleId(input.id) : sanitizeRecordId(`rule_${Date.now()}`);

  const next: CategoryRule = {
    id,
    categoryId,
    match,
    priority,
    enabled,
    ...(note ? { note: note.slice(0, 120) } : {}),
  };

  const byId = new Map(state.items.map((row) => [row.id, row]));
  byId.set(next.id, next);
  state.items = sortRules([...byId.values()]);
  await writeState(state);
  return next;
}

export async function deleteRule(id: unknown): Promise<boolean> {
  assertServerOnly();
  const safeId = normalizeRuleId(id);
  const state = await readState();
  const next = state.items.filter((row) => row.id !== safeId);
  if (next.length === state.items.length) return false;
  state.items = next;
  await writeState(state);
  return true;
}

