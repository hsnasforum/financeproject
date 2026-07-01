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
    version: 1,
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

export async function readPendingReplaceRestoreSnapshot(journalPath: string): Promise<ReplaceRestoreSnapshot | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(journalPath, "utf-8")) as unknown;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    throw error;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.kind !== "planning-data-vault-replace-restore-journal") return null;
  const root = asString(record.snapshotRoot);
  const rows = Array.isArray(record.entries) ? record.entries : [];
  if (!root) return null;
  const entries = rows
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const entryRecord = entry as Record<string, unknown>;
      const targetPath = asString(entryRecord.targetPath);
      const backupPath = asString(entryRecord.backupPath);
      if (!targetPath || !backupPath) return null;
      return {
        targetPath,
        backupPath,
        existed: entryRecord.existed === true,
      };
    })
    .filter((entry): entry is ReplaceRestoreSnapshotEntry => entry !== null);
  if (entries.length < 1) return null;
  return {
    root,
    journalPath,
    entries,
  };
}

export async function recoverPendingReplaceRestoreSnapshot(input: {
  journalPath: string;
} & ReplaceRestoreTransactionHooks): Promise<void> {
  const snapshot = await readPendingReplaceRestoreSnapshot(input.journalPath);
  if (!snapshot) return;
  await rollbackReplaceRestoreSnapshot(snapshot, input);
  await cleanupReplaceRestoreSnapshot(snapshot, input);
}
