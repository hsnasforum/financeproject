import fs from "node:fs/promises";
import path from "node:path";

export type PlanningTrashKind = "profiles" | "runs" | "reports";

export const TRASH_DIR = ".data/planning/trash";

export type PlanningTrashItem = {
  kind: PlanningTrashKind;
  id: string;
  pathRelative: string;
  deletedAt: string;
  sizeBytes: number;
};

type TrashFileInput = {
  kind: PlanningTrashKind;
  id: string;
  ext: ".json" | ".md" | ".meta.json";
};

type PurgeTrashOptions = {
  keepDays: number;
  nowIso?: string;
  kind?: PlanningTrashKind | "all";
  baseDir?: string;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning trash storage is server-only.");
  }
}

assertServerOnly();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveBaseDir(baseDir?: string): string {
  return path.resolve(baseDir || process.cwd());
}

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function sanitizeId(id: unknown): string {
  const value = asString(id);
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error("Invalid trash id");
  }
  return value;
}

function resolveTrashRoot(baseDir = process.cwd()): string {
  const override = asString(process.env.PLANNING_TRASH_DIR);
  return path.resolve(baseDir, override || TRASH_DIR);
}

export function resolveTrashKindDir(
  kind: PlanningTrashKind,
  baseDir = process.cwd(),
): string {
  return path.join(resolveTrashRoot(baseDir), kind);
}

function resolveTrashFilePath(input: TrashFileInput, baseDir = process.cwd()): string {
  return path.join(resolveTrashKindDir(input.kind, baseDir), `${sanitizeId(input.id)}${input.ext}`);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function moveFileToTrash(
  sourcePath: string,
  input: TrashFileInput,
): Promise<boolean> {
  const trashPath = resolveTrashFilePath(input);
  await ensureDir(path.dirname(trashPath));
  try {
    await fs.unlink(trashPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") throw error;
  }
  try {
    await fs.rename(sourcePath, trashPath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

export async function restoreFileFromTrash(
  destinationPath: string,
  input: TrashFileInput,
): Promise<boolean> {
  const trashPath = resolveTrashFilePath(input);
  await ensureDir(path.dirname(destinationPath));
  try {
    await fs.access(destinationPath);
    throw new Error("destination already exists");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") {
      if (error instanceof Error && error.message === "destination already exists") throw error;
      throw error;
    }
  }

  try {
    await fs.rename(trashPath, destinationPath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

export async function deleteFileFromTrash(
  input: TrashFileInput,
): Promise<boolean> {
  const trashPath = resolveTrashFilePath(input);
  try {
    await fs.unlink(trashPath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

async function listTrashFilesForKind(
  kind: PlanningTrashKind,
  baseDir = process.cwd(),
): Promise<PlanningTrashItem[]> {
  const dir = resolveTrashKindDir(kind, baseDir);
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }

  const rows: PlanningTrashItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (kind === "reports") {
      if (!entry.name.endsWith(".md")) continue;
    } else if (!entry.name.endsWith(".json")) {
      continue;
    }
    const id = entry.name
      .replace(/\.meta\.json$/i, "")
      .replace(/\.json$/i, "")
      .replace(/\.md$/i, "");
    if (!SAFE_ID_PATTERN.test(id)) continue;

    const absPath = path.join(dir, entry.name);
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat) continue;
    rows.push({
      kind,
      id,
      pathRelative: normalizeRelativePath(absPath, baseDir),
      deletedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    });
  }
  return rows;
}

export async function listPlanningTrash(
  kind: PlanningTrashKind | "all" = "all",
  limit = 200,
  baseDir?: string,
): Promise<PlanningTrashItem[]> {
  const base = resolveBaseDir(baseDir);
  const kinds: PlanningTrashKind[] = kind === "all" ? ["profiles", "runs", "reports"] : [kind];
  const rows = (await Promise.all(kinds.map((row) => listTrashFilesForKind(row, base)))).flat();
  const safeLimit = Math.max(1, Math.min(2000, Math.trunc(Number(limit)) || 200));
  return rows.sort((a, b) => {
    const aTs = Date.parse(a.deletedAt);
    const bTs = Date.parse(b.deletedAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) return bTs - aTs;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.id.localeCompare(b.id);
  }).slice(0, safeLimit);
}

export async function emptyPlanningTrash(
  kind: PlanningTrashKind | "all" = "all",
  baseDir?: string,
): Promise<{ deleted: number }> {
  const base = resolveBaseDir(baseDir);
  const kinds: PlanningTrashKind[] = kind === "all" ? ["profiles", "runs", "reports"] : [kind];
  let deleted = 0;
  for (const row of kinds) {
    const dir = resolveTrashKindDir(row, base);
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(dir, entry.name);
      try {
        await fs.unlink(filePath);
        deleted += 1;
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code !== "ENOENT") throw error;
      }
    }
  }
  return { deleted };
}

export async function purgePlanningTrashOlderThan(
  options: PurgeTrashOptions,
): Promise<{ deleted: number }> {
  const keepDays = Math.max(1, Math.min(36500, Math.trunc(Number(options.keepDays)) || 30));
  const nowMs = Number.isFinite(Date.parse(asString(options.nowIso)))
    ? Date.parse(asString(options.nowIso))
    : Date.now();
  const kind = options.kind ?? "all";
  const rows = await listPlanningTrash(kind, 5000, options.baseDir);
  let deleted = 0;
  for (const row of rows) {
    const deletedMs = Date.parse(row.deletedAt);
    if (!Number.isFinite(deletedMs)) continue;
    const ageDays = Math.floor(Math.max(0, nowMs - deletedMs) / (24 * 60 * 60 * 1000));
    if (ageDays <= keepDays) continue;

    if (row.kind === "reports") {
      const removedMd = await deleteFileFromTrash({ kind: "reports", id: row.id, ext: ".md" });
      const removedMeta = await deleteFileFromTrash({ kind: "reports", id: row.id, ext: ".meta.json" });
      if (removedMd) deleted += 1;
      if (removedMeta) deleted += 1;
    } else {
      const removed = await deleteFileFromTrash({ kind: row.kind, id: row.id, ext: ".json" });
      if (removed) deleted += 1;
    }
  }
  return { deleted };
}
