import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../planning/storage/atomicWrite";

export type ReplaceRestoreFaultOperation = {
  phase: "preflight" | "commit" | "rollback" | "cleanup";
  kind: "snapshot" | "clear" | "write" | "rollback" | "cleanup";
  entity?: "profile" | "run" | "runBlob" | "actionPlan" | "actionProgress" | "assumptions" | "policy" | "restore";
  id?: string;
  path?: string;
};

export type ReplaceRestoreFaultInjection = {
  beforeOperation?: (operation: ReplaceRestoreFaultOperation) => void | Promise<void>;
  beforeWrite?: (operation: ReplaceRestoreFaultOperation) => void | Promise<void>;
};

export type ReplaceRestoreSnapshotEntry = {
  targetPath: string;
  backupPath: string;
  existed: boolean;
};

export type ReplaceRestoreSnapshot = {
  root: string;
  journalPath: string;
  entries: ReplaceRestoreSnapshotEntry[];
};

export type ReplaceRestoreTransactionHooks = {
  faultInjection?: ReplaceRestoreFaultInjection;
};

export class ReplaceRestoreJournalError extends Error {
  readonly code = "REPLACE_RESTORE_JOURNAL_INVALID";

  constructor(detail: string) {
    super(`REPLACE_RESTORE_JOURNAL_INVALID:${detail}`);
    this.name = "ReplaceRestoreJournalError";
  }
}

export async function callReplaceRestoreFaultInjection(
  faultInjection: ReplaceRestoreFaultInjection | undefined,
  operation: ReplaceRestoreFaultOperation,
): Promise<void> {
  await faultInjection?.beforeOperation?.(operation);
  if (operation.kind === "write") {
    await faultInjection?.beforeWrite?.(operation);
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return false;
    throw error;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function writeReplaceRestoreJournal(snapshot: ReplaceRestoreSnapshot): Promise<void> {
  await atomicWriteJson(snapshot.journalPath, {
    version: 2,
    kind: "planning-data-vault-replace-restore-journal",
    createdAt: new Date().toISOString(),
    snapshotRoot: snapshot.root,
    entries: snapshot.entries,
  });
}

export async function createReplaceRestoreSnapshot(input: {
  targets: string[];
  snapshotRoot: string;
  journalPath: string;
} & ReplaceRestoreTransactionHooks): Promise<ReplaceRestoreSnapshot> {
  const entries: ReplaceRestoreSnapshotEntry[] = [];
  await fs.mkdir(input.snapshotRoot, { recursive: true });

  for (const [index, targetPath] of input.targets.entries()) {
    await callReplaceRestoreFaultInjection(input.faultInjection, {
      phase: "preflight",
      kind: "snapshot",
      path: targetPath,
    });
    const backupPath = path.join(input.snapshotRoot, `${index}`);
    const existed = await pathExists(targetPath);
    entries.push({ targetPath, backupPath, existed });
    if (!existed) continue;
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.cp(targetPath, backupPath, {
      recursive: true,
      force: true,
      verbatimSymlinks: true,
    });
  }

  const snapshot = {
    root: input.snapshotRoot,
    journalPath: input.journalPath,
    entries,
  };
  await writeReplaceRestoreJournal(snapshot);
  return snapshot;
}

export async function rollbackReplaceRestoreSnapshot(
  snapshot: ReplaceRestoreSnapshot,
  hooks: ReplaceRestoreTransactionHooks = {},
): Promise<void> {
  for (const entry of [...snapshot.entries].reverse()) {
    await callReplaceRestoreFaultInjection(hooks.faultInjection, {
      phase: "rollback",
      kind: "rollback",
      path: entry.targetPath,
    });
    await fs.rm(entry.targetPath, { recursive: true, force: true });
    if (!entry.existed) continue;
    await fs.mkdir(path.dirname(entry.targetPath), { recursive: true });
    await fs.cp(entry.backupPath, entry.targetPath, {
      recursive: true,
      force: true,
      verbatimSymlinks: true,
    });
  }
}

export async function cleanupReplaceRestoreSnapshot(
  snapshot: ReplaceRestoreSnapshot,
  hooks: ReplaceRestoreTransactionHooks = {},
): Promise<void> {
  await callReplaceRestoreFaultInjection(hooks.faultInjection, {
    phase: "cleanup",
    kind: "cleanup",
    path: snapshot.root,
  });
  await fs.rm(snapshot.root, { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(snapshot.journalPath, { force: true }).catch(() => undefined);
}

function normalizedPath(value: string): string {
  const resolved = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/u, "") || "/";
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const parent = normalizedPath(parentPath);
  const candidate = normalizedPath(candidatePath);
  return candidate.startsWith(`${parent}/`);
}

export async function readPendingReplaceRestoreSnapshot(input: {
  journalPath: string;
  allowedTargets: readonly string[];
  allowedSnapshotParent: string;
}): Promise<ReplaceRestoreSnapshot | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(input.journalPath, "utf-8")) as unknown;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReplaceRestoreJournalError("object");
  }
  const record = raw as Record<string, unknown>;
  if (record.kind !== "planning-data-vault-replace-restore-journal") {
    throw new ReplaceRestoreJournalError("kind");
  }
  if (record.version !== 1 && record.version !== 2) {
    throw new ReplaceRestoreJournalError("version");
  }
  const root = asString(record.snapshotRoot);
  const rows = Array.isArray(record.entries) ? record.entries : [];
  if (!root || !path.isAbsolute(root) || !isPathInside(input.allowedSnapshotParent, root)) {
    throw new ReplaceRestoreJournalError("snapshot-root");
  }
  const entries = rows
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const entryRecord = entry as Record<string, unknown>;
      const targetPath = asString(entryRecord.targetPath);
      const backupPath = asString(entryRecord.backupPath);
      if (!targetPath || !backupPath || !path.isAbsolute(targetPath) || !path.isAbsolute(backupPath)) return null;
      return {
        targetPath,
        backupPath,
        existed: entryRecord.existed === true,
      };
    })
    .filter((entry): entry is ReplaceRestoreSnapshotEntry => entry !== null);
  if (entries.length < 1 || entries.length !== rows.length) {
    throw new ReplaceRestoreJournalError("entries");
  }
  const allowedTargets = new Set(input.allowedTargets.map(normalizedPath));
  const seenTargets = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const normalizedTarget = normalizedPath(entry.targetPath);
    if (!allowedTargets.has(normalizedTarget) || seenTargets.has(normalizedTarget)) {
      throw new ReplaceRestoreJournalError("target");
    }
    seenTargets.add(normalizedTarget);
    if (normalizedPath(entry.backupPath) !== normalizedPath(path.join(root, `${index}`))) {
      throw new ReplaceRestoreJournalError("backup-path");
    }
  }
  return {
    root,
    journalPath: input.journalPath,
    entries,
  };
}

export async function recoverPendingReplaceRestoreSnapshot(input: {
  journalPath: string;
  allowedTargets: readonly string[];
  allowedSnapshotParent: string;
} & ReplaceRestoreTransactionHooks): Promise<void> {
  const snapshot = await readPendingReplaceRestoreSnapshot(input);
  if (!snapshot) return;
  await rollbackReplaceRestoreSnapshot(snapshot, input);
  await cleanupReplaceRestoreSnapshot(snapshot, input);
}
