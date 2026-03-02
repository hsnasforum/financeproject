import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile, atomicWriteJson } from "../storage/atomicWrite";
import { type PlanningRunRecord } from "../store/types";
import { getRun } from "../store/runStore";
import {
  deleteFileFromTrash,
  moveFileToTrash,
  restoreFileFromTrash,
} from "../store/trash";
import {
  buildResultDtoV1FromRunRecord,
  isResultDtoV1,
  toMarkdownFromResultDto,
} from "../v2/resultDto";

export const REPORTS_DIR = ".data/planning/reports";

type ReportKind = "run" | "manual";

type PlanningReportMeta = {
  version: 1;
  id: string;
  createdAt: string;
  kind: ReportKind;
  runId?: string;
  pathRelative: string;
};

export type PlanningReportListItem = {
  id: string;
  createdAt: string;
  kind: ReportKind;
  runId?: string;
  pathRelative: string;
};

export type PlanningReportData = {
  markdown: string;
  meta: PlanningReportListItem;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning report storage is server-only.");
  }
}

assertServerOnly();

const SAFE_REPORT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeReportId(id: unknown): string {
  const value = asString(id);
  if (!SAFE_REPORT_ID.test(value)) {
    throw new Error("invalid report id");
  }
  return value;
}

function resolveReportsDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_REPORTS_DIR);
  return path.resolve(cwd, override || REPORTS_DIR);
}

function mdPathById(id: string): string {
  return path.join(resolveReportsDir(), `${sanitizeReportId(id)}.md`);
}

function metaPathById(id: string): string {
  return path.join(resolveReportsDir(), `${sanitizeReportId(id)}.meta.json`);
}

function normalizeRelativePath(filePath: string, cwd = process.cwd()): string {
  return path.relative(cwd, filePath).split(path.sep).join("/");
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

function isMeta(value: unknown): value is PlanningReportMeta {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!SAFE_REPORT_ID.test(asString(value.id))) return false;
  if (!asString(value.createdAt)) return false;
  if (value.kind !== "run" && value.kind !== "manual") return false;
  if (value.runId !== undefined && !asString(value.runId)) return false;
  if (!asString(value.pathRelative)) return false;
  return true;
}

async function readMetaById(id: string): Promise<PlanningReportMeta | null> {
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

async function ensureUniqueReportId(baseId: string): Promise<string> {
  let candidate = sanitizeReportId(baseId);
  let suffix = 2;
  while (true) {
    const filePath = path.join(resolveReportsDir(), `${candidate}.md`);
    try {
      await fs.access(filePath);
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") return candidate;
      throw error;
    }
  }
}

function toReportMeta(meta: PlanningReportMeta): PlanningReportListItem {
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    kind: meta.kind,
    ...(meta.runId ? { runId: meta.runId } : {}),
    pathRelative: meta.pathRelative,
  };
}

export async function listReports(limit = 50): Promise<PlanningReportListItem[]> {
  assertServerOnly();

  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 50));
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(resolveReportsDir(), { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const rows: PlanningReportListItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const id = entry.name.slice(0, -3);
    if (!SAFE_REPORT_ID.test(id)) continue;
    const filePath = path.join(resolveReportsDir(), entry.name);
    const stats = await fs.stat(filePath);
    const fallbackMeta: PlanningReportMeta = {
      version: 1,
      id,
      createdAt: stats.mtime.toISOString(),
      kind: "manual",
      pathRelative: normalizeRelativePath(filePath),
    };
    const meta = await readMetaById(id) ?? fallbackMeta;
    rows.push(toReportMeta(meta));
  }

  return rows
    .sort((a, b) => {
      const aTs = Date.parse(a.createdAt);
      const bTs = Date.parse(b.createdAt);
      if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) return bTs - aTs;
      return b.id.localeCompare(a.id);
    })
    .slice(0, safeLimit);
}

export async function getReport(id: string): Promise<PlanningReportData | null> {
  assertServerOnly();

  const safeId = sanitizeReportId(id);
  try {
    const markdown = await fs.readFile(mdPathById(safeId), "utf-8");
    const stats = await fs.stat(mdPathById(safeId));
    const fallbackMeta: PlanningReportMeta = {
      version: 1,
      id: safeId,
      createdAt: stats.mtime.toISOString(),
      kind: "manual",
      pathRelative: normalizeRelativePath(mdPathById(safeId)),
    };
    const meta = await readMetaById(safeId) ?? fallbackMeta;
    return { markdown, meta: toReportMeta(meta) };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
}

export async function createReportFromRun(runId: string): Promise<{ id: string }> {
  assertServerOnly();

  const safeRunId = asString(runId);
  if (!safeRunId) throw new Error("runId is required");

  const run = await getRun(safeRunId);
  if (!run) throw new Error("run not found");

  const reportIdBase = `report-${toIsoToken()}-${safeRunId.slice(0, 8)}`;
  const reportId = await ensureUniqueReportId(reportIdBase);
  const markdownPath = mdPathById(reportId);
  const metaPath = metaPathById(reportId);
  const createdAt = new Date().toISOString();

  const rawResultDto = isRecord(run.outputs) ? run.outputs.resultDto : undefined;
  const resultDto = isResultDtoV1(rawResultDto)
    ? rawResultDto
    : buildResultDtoV1FromRunRecord(run);
  const markdown = toMarkdownFromResultDto(resultDto, {
    title: run.title || `Planning Report (${run.id})`,
    reportId,
    runId: run.id,
  });

  const meta: PlanningReportMeta = {
    version: 1,
    id: reportId,
    createdAt,
    kind: "run",
    runId: run.id,
    pathRelative: normalizeRelativePath(markdownPath),
  };

  await writeTextAtomic(markdownPath, markdown);
  await writeJsonAtomic(metaPath, meta);
  return { id: reportId };
}

export async function deleteReport(id: string): Promise<boolean> {
  assertServerOnly();

  const safeId = sanitizeReportId(id);
  const movedMd = await moveFileToTrash(mdPathById(safeId), {
    kind: "reports",
    id: safeId,
    ext: ".md",
  });
  const movedMeta = await moveFileToTrash(metaPathById(safeId), {
    kind: "reports",
    id: safeId,
    ext: ".meta.json",
  });
  return movedMd || movedMeta;
}

export async function restoreReportFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeReportId(id);
  const restoredMd = await restoreFileFromTrash(mdPathById(safeId), {
    kind: "reports",
    id: safeId,
    ext: ".md",
  });
  const restoredMeta = await restoreFileFromTrash(metaPathById(safeId), {
    kind: "reports",
    id: safeId,
    ext: ".meta.json",
  });
  return restoredMd || restoredMeta;
}

export async function hardDeleteReportFromTrash(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeReportId(id);
  const deletedMd = await deleteFileFromTrash({
    kind: "reports",
    id: safeId,
    ext: ".md",
  });
  const deletedMeta = await deleteFileFromTrash({
    kind: "reports",
    id: safeId,
    ext: ".meta.json",
  });
  return deletedMd || deletedMeta;
}
