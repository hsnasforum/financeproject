import fs from "node:fs/promises";
import { type Dirent } from "node:fs";
import path from "node:path";
import type {
  PlanningFeedback,
  PlanningFeedbackCreateInput,
  PlanningFeedbackPriority,
  PlanningFeedbackStatus,
  PlanningFeedbackUpdatePatch,
} from "./planningFeedbackTypes";

const DEFAULT_FEEDBACK_DIR = path.join(process.cwd(), ".data", "ops", "feedback", "planning");
const MAX_ITEMS = 1000;
const MAX_TITLE_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 32;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIso(input: unknown): string {
  const raw = asString(input);
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function normalizeStatus(value: unknown): PlanningFeedbackStatus {
  return value === "triaged" || value === "doing" || value === "done" ? value : "new";
}

function normalizePriority(value: unknown): PlanningFeedbackPriority {
  return value === "p0" || value === "p1" || value === "p3" ? value : "p2";
}

function normalizeDue(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const parsed = Date.parse(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return undefined;
  return raw;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    const compact = asString(row).replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!compact) continue;
    const key = compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(compact);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function normalizeIssueNumber(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function normalizeIssueUrl(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  if (!/^https?:\/\//i.test(raw)) return undefined;
  return raw;
}

function normalizeGithubIssue(value: unknown): NonNullable<PlanningFeedback["link"]>["githubIssue"] | undefined {
  if (!isRecord(value)) return undefined;
  const number = normalizeIssueNumber(value.number);
  const url = normalizeIssueUrl(value.url);
  if (typeof number !== "number" || !url) return undefined;
  return {
    number,
    url,
    createdAt: toIso(value.createdAt),
  };
}

function normalizeFeedback(value: unknown): PlanningFeedback | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const createdAt = toIso(value.createdAt);
  if (!id) return null;

  const fromRaw = isRecord(value.from) ? value.from : {};
  const screen = asString(fromRaw.screen) || "/planning";

  const contextRaw = isRecord(value.context) ? value.context : {};
  const snapshotRaw = isRecord(contextRaw.snapshot) ? contextRaw.snapshot : null;
  const healthRaw = isRecord(contextRaw.health) ? contextRaw.health : null;

  const contentRaw = isRecord(value.content) ? value.content : {};
  const category = asString(contentRaw.category);
  if (!(category === "bug" || category === "ux" || category === "data" || category === "other")) return null;
  const title = asString(contentRaw.title).slice(0, MAX_TITLE_LENGTH);
  const message = asString(contentRaw.message).slice(0, MAX_MESSAGE_LENGTH);
  if (!title || !message) return null;

  const triageRaw = isRecord(value.triage) ? value.triage : {};
  const linkRaw = isRecord(value.link) ? value.link : {};
  const githubIssue = normalizeGithubIssue(linkRaw.githubIssue);
  const triage = {
    status: normalizeStatus(triageRaw.status),
    priority: normalizePriority(triageRaw.priority),
    tags: normalizeTags(triageRaw.tags),
    ...(normalizeDue(triageRaw.due) ? { due: normalizeDue(triageRaw.due) } : {}),
  };

  return {
    version: 1,
    id,
    createdAt,
    from: { screen },
    context: {
      ...(snapshotRaw ? {
        snapshot: {
          ...(asString(snapshotRaw.id) ? { id: asString(snapshotRaw.id) } : {}),
          ...(asString(snapshotRaw.asOf) ? { asOf: asString(snapshotRaw.asOf) } : {}),
          ...(asString(snapshotRaw.fetchedAt) ? { fetchedAt: asString(snapshotRaw.fetchedAt) } : {}),
          ...(typeof snapshotRaw.missing === "boolean" ? { missing: snapshotRaw.missing } : {}),
        },
      } : {}),
      ...(asString(contextRaw.runId) ? { runId: asString(contextRaw.runId) } : {}),
      ...(asString(contextRaw.reportId) ? { reportId: asString(contextRaw.reportId) } : {}),
      ...(healthRaw ? {
        health: {
          ...(typeof healthRaw.criticalCount === "number" && Number.isFinite(healthRaw.criticalCount)
            ? { criticalCount: Math.max(0, Math.trunc(healthRaw.criticalCount)) }
            : {}),
          ...(Array.isArray(healthRaw.warningsCodes)
            ? { warningsCodes: healthRaw.warningsCodes.map((row) => asString(row)).filter((row) => row.length > 0).slice(0, 50) }
            : {}),
        },
      } : {}),
    },
    content: {
      category,
      title,
      message,
    },
    triage,
    ...(githubIssue ? { link: { githubIssue } } : {}),
  };
}

function resolveDirPath(): string {
  const override = asString(process.env.PLANNING_FEEDBACK_DIR);
  if (!override) return DEFAULT_FEEDBACK_DIR;
  return path.resolve(override);
}

function resolveFilePath(id: string): string {
  return path.join(resolveDirPath(), `${id}.json`);
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmp, filePath);
}

async function listFiles(): Promise<string[]> {
  const dir = resolveDirPath();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dir, entry.name));
}

async function readFeedbackFile(filePath: string): Promise<PlanningFeedback | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeFeedback(JSON.parse(raw));
  } catch {
    return null;
  }
}

function sortByCreatedAtDesc(items: PlanningFeedback[]): PlanningFeedback[] {
  return items.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createFeedback(input: PlanningFeedbackCreateInput): Promise<PlanningFeedback> {
  const now = new Date().toISOString();
  const next: PlanningFeedback = {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: now,
    from: {
      screen: asString(input.from.screen) || "/planning",
    },
    context: {
      ...(input.context?.snapshot ? {
        snapshot: {
          ...(asString(input.context.snapshot.id) ? { id: asString(input.context.snapshot.id) } : {}),
          ...(asString(input.context.snapshot.asOf) ? { asOf: asString(input.context.snapshot.asOf) } : {}),
          ...(asString(input.context.snapshot.fetchedAt) ? { fetchedAt: asString(input.context.snapshot.fetchedAt) } : {}),
          ...(typeof input.context.snapshot.missing === "boolean" ? { missing: input.context.snapshot.missing } : {}),
        },
      } : {}),
      ...(asString(input.context?.runId) ? { runId: asString(input.context?.runId) } : {}),
      ...(asString(input.context?.reportId) ? { reportId: asString(input.context?.reportId) } : {}),
      ...(input.context?.health ? {
        health: {
          ...(typeof input.context.health.criticalCount === "number"
            ? { criticalCount: Math.max(0, Math.trunc(input.context.health.criticalCount)) }
            : {}),
          ...(Array.isArray(input.context.health.warningsCodes)
            ? { warningsCodes: input.context.health.warningsCodes.map((row) => asString(row)).filter((row) => row.length > 0).slice(0, 50) }
            : {}),
        },
      } : {}),
    },
    content: {
      category: input.content.category,
      title: asString(input.content.title).slice(0, MAX_TITLE_LENGTH),
      message: asString(input.content.message).slice(0, MAX_MESSAGE_LENGTH),
    },
    triage: {
      status: "new",
      priority: "p2",
      tags: [],
    },
  };

  if (!next.content.title || !next.content.message) {
    throw new Error("title/message는 필수입니다.");
  }

  await writeJsonAtomic(resolveFilePath(next.id), next);
  return next;
}

export async function getFeedback(id: string): Promise<PlanningFeedback | null> {
  const needle = asString(id);
  if (!needle) return null;
  return readFeedbackFile(resolveFilePath(needle));
}

export async function listFeedback(options: {
  status?: PlanningFeedbackStatus;
  limit?: number;
} = {}): Promise<PlanningFeedback[]> {
  const files = await listFiles();
  const loaded = (await Promise.all(files.map((filePath) => readFeedbackFile(filePath))))
    .filter((row): row is PlanningFeedback => row !== null);
  const sorted = sortByCreatedAtDesc(loaded);
  const filtered = options.status ? sorted.filter((row) => row.triage.status === options.status) : sorted;
  const limitRaw = Math.trunc(Number(options.limit ?? 100));
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_ITEMS, limitRaw)) : 100;
  return filtered.slice(0, limit);
}

export async function updateFeedback(id: string, patch: PlanningFeedbackUpdatePatch): Promise<PlanningFeedback | null> {
  const existing = await getFeedback(id);
  if (!existing) return null;

  const triagePatch = patch.triage ?? {};
  const linkPatch = patch.link ?? {};
  const githubIssuePatch = normalizeGithubIssue(
    isRecord(linkPatch.githubIssue)
      ? linkPatch.githubIssue
      : undefined,
  );
  const next: PlanningFeedback = {
    ...existing,
    triage: {
      ...existing.triage,
      ...(triagePatch.status ? { status: normalizeStatus(triagePatch.status) } : {}),
      ...(triagePatch.priority ? { priority: normalizePriority(triagePatch.priority) } : {}),
      ...(triagePatch.tags ? { tags: normalizeTags(triagePatch.tags) } : {}),
      ...(Object.prototype.hasOwnProperty.call(triagePatch, "due")
        ? (normalizeDue(triagePatch.due)
            ? { due: normalizeDue(triagePatch.due) }
            : {})
        : {}),
    },
    ...(githubIssuePatch
      ? {
        link: {
          ...(existing.link ?? {}),
          githubIssue: githubIssuePatch,
        },
      }
      : {}),
  };

  // explicit due clear
  if (Object.prototype.hasOwnProperty.call(triagePatch, "due") && !normalizeDue(triagePatch.due)) {
    const { due, ...rest } = next.triage;
    next.triage = rest;
    void due;
  }

  await writeJsonAtomic(resolveFilePath(existing.id), next);
  return next;
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const needle = asString(id);
  if (!needle) return false;
  try {
    await fs.rm(resolveFilePath(needle), { force: true });
    return true;
  } catch {
    return false;
  }
}
