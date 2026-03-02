import fs from "node:fs/promises";
import path from "node:path";
import { resolvePlanningDataDir } from "../server/runtime/dataDir";
import { atomicWriteFile, atomicWriteJson } from "../storage/atomicWrite";
import { getProfile } from "../store/profileStore";
import { getRun } from "../store/runStore";
import { type AssumptionsV2 } from "../v2/scenarios";
import { toShareMarkdown, type ShareReportAction, type ShareReportWarning } from "./report";
import { type MaskLevel } from "./mask";

export const SHARE_REPORTS_DIR = ".data/planning/share";

type ShareReportMeta = {
  version: 1;
  id: string;
  runId: string;
  level: MaskLevel;
  createdAt: string;
};

export type ShareReportRef = {
  id: string;
  runId: string;
  level: MaskLevel;
  createdAt: string;
};

export type ShareReportData = {
  markdown: string;
  meta: ShareReportRef;
};

const SAFE_SHARE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning share report storage is server-only.");
  }
}

assertServerOnly();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asMaskLevel(value: unknown): MaskLevel {
  return value === "light" || value === "standard" || value === "strict" ? value : "standard";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeShareId(id: unknown): string {
  const value = asString(id);
  if (!SAFE_SHARE_ID.test(value)) {
    throw new Error("invalid share report id");
  }
  return value;
}

function resolveShareDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_SHARE_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "share");
}

function mdPathById(id: string): string {
  return path.join(resolveShareDir(), `${sanitizeShareId(id)}.md`);
}

function metaPathById(id: string): string {
  return path.join(resolveShareDir(), `${sanitizeShareId(id)}.meta.json`);
}

function toIsoToken(date = new Date()): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  await atomicWriteFile(filePath, content);
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await atomicWriteJson(filePath, payload);
}

function toRef(meta: ShareReportMeta): ShareReportRef {
  return {
    id: meta.id,
    runId: meta.runId,
    level: meta.level,
    createdAt: meta.createdAt,
  };
}

function isMeta(value: unknown): value is ShareReportMeta {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!SAFE_SHARE_ID.test(asString(value.id))) return false;
  if (!asString(value.runId)) return false;
  if (!(value.level === "light" || value.level === "standard" || value.level === "strict")) return false;
  if (!asString(value.createdAt)) return false;
  return true;
}

async function readMeta(id: string): Promise<ShareReportMeta | null> {
  try {
    const raw = await fs.readFile(metaPathById(id), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return isMeta(parsed) ? parsed : null;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureUniqueId(baseId: string): Promise<string> {
  let candidate = sanitizeShareId(baseId);
  let suffix = 2;
  while (true) {
    try {
      await fs.access(mdPathById(candidate));
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") return candidate;
      throw error;
    }
  }
}

function parseWarnings(rawWarnings: unknown): ShareReportWarning[] {
  if (!Array.isArray(rawWarnings)) return [];
  return rawWarnings
    .map((item) => {
      if (typeof item === "string") {
        const code = asString(item);
        return code ? { code } : null;
      }
      if (isRecord(item)) {
        const code = asString(item.code ?? item.reasonCode);
        if (!code) return null;
        const message = asString(item.message);
        return {
          code,
          ...(message ? { message } : {}),
        };
      }
      return null;
    })
    .filter((item): item is ShareReportWarning => Boolean(item));
}

function parseActions(rawActions: unknown): ShareReportAction[] {
  if (!isRecord(rawActions) || !Array.isArray(rawActions.actions)) return [];
  return rawActions.actions
    .map((item) => {
      if (!isRecord(item)) return null;
      const code = asString(item.code);
      if (!code) return null;
      const title = asString(item.title);
      const summary = asString(item.summary);
      return {
        code,
        ...(title ? { title } : {}),
        ...(summary ? { summary } : {}),
      };
    })
    .filter((item): item is ShareReportAction => Boolean(item));
}

function parseAssumptions(raw: unknown): Partial<AssumptionsV2> {
  if (!isRecord(raw)) return {};
  const out: Partial<AssumptionsV2> = {};
  if (typeof raw.inflationPct === "number" && Number.isFinite(raw.inflationPct)) out.inflationPct = raw.inflationPct;
  if (typeof raw.cashReturnPct === "number" && Number.isFinite(raw.cashReturnPct)) out.cashReturnPct = raw.cashReturnPct;
  if (typeof raw.investReturnPct === "number" && Number.isFinite(raw.investReturnPct)) out.investReturnPct = raw.investReturnPct;
  return out;
}

export async function listShareReports(limit = 50): Promise<ShareReportRef[]> {
  assertServerOnly();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit)) || 50));

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(resolveShareDir(), { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const refs: ShareReportRef[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".meta.json")) continue;
    const id = entry.name.replace(/\.meta\.json$/i, "");
    if (!SAFE_SHARE_ID.test(id)) continue;
    const meta = await readMeta(id);
    if (meta) refs.push(toRef(meta));
  }

  return refs
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, safeLimit);
}

export async function getShareReport(id: string): Promise<ShareReportData | null> {
  assertServerOnly();
  const safeId = sanitizeShareId(id);
  try {
    const markdown = await fs.readFile(mdPathById(safeId), "utf-8");
    const meta = await readMeta(safeId);
    if (!meta) return null;
    return {
      markdown,
      meta: toRef(meta),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

export async function createShareReportFromRun(
  runId: string,
  level: MaskLevel = "standard",
): Promise<ShareReportRef> {
  assertServerOnly();

  const safeRunId = asString(runId);
  if (!safeRunId) throw new Error("runId is required");

  const run = await getRun(safeRunId);
  if (!run) throw new Error("run not found");

  const profileRecord = await getProfile(run.profileId);
  if (!profileRecord) throw new Error("profile not found");

  const assumptions = parseAssumptions(run.input?.assumptionsOverride);
  const summary = isRecord(run.outputs?.simulate?.summary)
    ? run.outputs.simulate.summary as Record<string, unknown>
    : {};
  const warnings = parseWarnings(run.outputs?.simulate?.warnings);
  const actions = parseActions(run.outputs?.actions);
  const monteCarlo = isRecord(run.outputs?.monteCarlo)
    ? { probabilities: isRecord(run.outputs.monteCarlo.probabilities) ? run.outputs.monteCarlo.probabilities : {} }
    : null;

  const createdAt = new Date().toISOString();
  const idBase = `share-${toIsoToken()}-${safeRunId.slice(0, 8)}`;
  const id = await ensureUniqueId(idBase);
  const resolvedLevel = asMaskLevel(level);

  const markdown = toShareMarkdown({
    runId: run.id,
    level: resolvedLevel,
    generatedAt: createdAt,
    profile: profileRecord.profile,
    summary,
    warnings,
    actions,
    monteCarlo,
    assumptions,
  });

  const meta: ShareReportMeta = {
    version: 1,
    id,
    runId: run.id,
    level: resolvedLevel,
    createdAt,
  };

  await writeTextAtomic(mdPathById(id), markdown);
  await writeJsonAtomic(metaPathById(id), meta);

  return toRef(meta);
}
