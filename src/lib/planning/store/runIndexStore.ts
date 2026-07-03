import { type Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  appendStorageTransactionStep,
  beginStorageTransaction,
  endStorageTransaction,
  type StorageTransactionContext,
} from "../storage/journal";
import { withPlanningStoreWriteLock } from "../storage/storeWriteLock";
import {
  resolveProfilePartitionsDir,
  resolveRunsDir,
  resolveRunsIndexPath,
  sanitizeRecordId,
} from "./paths";
import {
  fromStoredPayload,
  readJsonFile,
  toStoredPayload,
  writeJsonAtomic,
} from "./runRecordCodec";
import {
  buildRunIndexFile,
  parseRunIndex,
  sortRunIndexEntriesByCreatedAtDesc,
  toRunIndexEntry,
  type RunIndexEntry,
} from "./runIndex";
import { type PlanningRunRecord } from "./types";

const BLOB_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

type ReadRunMeta = (id: string, profileIdHint?: string) => Promise<PlanningRunRecord | null>;

type ReadRunIndexOptions = {
  repair?: boolean;
};

type WriteRunIndexOptions = {
  journal?: boolean;
  tx?: StorageTransactionContext;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

export function createRunIndexStore(input: {
  readRunMeta: ReadRunMeta;
}): {
  read: (options?: ReadRunIndexOptions) => Promise<RunIndexEntry[]>;
  scan: () => Promise<RunIndexEntry[]>;
  rebuild: () => Promise<{ entries: number; indexPath: string }>;
  upsert: (entry: RunIndexEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const { readRunMeta } = input;

  async function scanPartitionRunsForIndex(): Promise<RunIndexEntry[]> {
    const partitionRoot = resolveProfilePartitionsDir();
    let profileEntries: Dirent[];
    try {
      profileEntries = await fs.readdir(partitionRoot, { withFileTypes: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") return [];
      throw error;
    }

    const out: RunIndexEntry[] = [];
    for (const profileEntry of profileEntries) {
      if (!profileEntry.isDirectory()) continue;
      const profileId = asString(profileEntry.name);
      if (!profileId) continue;

      const runsDir = path.join(partitionRoot, profileId, "runs");
      let runEntries: Dirent[];
      try {
        runEntries = await fs.readdir(runsDir, { withFileTypes: true });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code === "ENOENT") continue;
        throw error;
      }

      for (const runEntry of runEntries) {
        if (!runEntry.isDirectory()) continue;
        const runId = asString(runEntry.name);
        if (!runId) continue;
        const row = await readRunMeta(runId, profileId);
        if (row) out.push(toRunIndexEntry(row));
      }
    }

    return out;
  }

  async function scanRunsDirForIndex(): Promise<RunIndexEntry[]> {
    const out: RunIndexEntry[] = [];
    const partitionRows = await scanPartitionRunsForIndex();
    out.push(...partitionRows);

    const dirPath = resolveRunsDir();
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") return sortRunIndexEntriesByCreatedAtDesc(out);
      throw error;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const runId = sanitizeRecordId(entry.name);
          const row = await readRunMeta(runId);
          if (row) out.push(toRunIndexEntry(row));
        } catch {
          // Ignore non-run directory names.
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".json")) continue;
      if (entry.name === path.basename(resolveRunsIndexPath())) continue;

      const runId = entry.name.slice(0, -5);
      if (!BLOB_NAME_PATTERN.test(runId)) continue;
      try {
        const row = await readRunMeta(runId);
        if (row) out.push(toRunIndexEntry(row));
      } catch {
        continue;
      }
    }

    const deduped = Array.from(new Map(out.map((row) => [row.id, row])).values());
    return sortRunIndexEntriesByCreatedAtDesc(deduped);
  }

  async function writeRunIndex(
    entries: RunIndexEntry[],
    options?: WriteRunIndexOptions,
  ): Promise<void> {
    const filePath = resolveRunsIndexPath();
    const payload = buildRunIndexFile(entries);
    const shouldJournal = options?.journal !== false;
    const tx = options?.tx ?? (shouldJournal
      ? await beginStorageTransaction("RUN_INDEX_UPDATE", {
        indexPath: normalizeRelativePath(filePath),
        entriesCount: payload.entries.length,
      })
      : null);
    try {
      await writeJsonAtomic(filePath, await toStoredPayload(payload));
      if (tx) {
        await appendStorageTransactionStep(tx, "WRITE_INDEX", {
          indexPath: normalizeRelativePath(filePath),
          entriesCount: payload.entries.length,
        });
        if (!options?.tx) {
          await endStorageTransaction(tx, "COMMIT");
        }
      }
    } catch (error) {
      if (tx && !options?.tx) {
        await endStorageTransaction(
          tx,
          "ROLLBACK",
          error instanceof Error ? error.message : "run index write failed",
        ).catch(() => undefined);
      }
      throw error;
    }
  }

  function withRunIndexWriteLock<T>(callback: () => Promise<T> | T): Promise<T> {
    return withPlanningStoreWriteLock(`planning:runs:index:${resolveRunsIndexPath()}`, callback);
  }

  async function readRunIndex(options?: ReadRunIndexOptions): Promise<RunIndexEntry[]> {
    const filePath = resolveRunsIndexPath();
    const loaded = await readJsonFile(filePath);
    const decoded = loaded === null ? null : await fromStoredPayload(loaded);
    const decodedPayload = decoded?.payload ?? loaded;
    const parsed = parseRunIndex(decodedPayload);
    if (parsed.length > 0 || (isRecord(decodedPayload) && Array.isArray(decodedPayload.entries))) {
      if (options?.repair === true && decoded?.rewriteToVault) {
        await withRunIndexWriteLock(() => writeRunIndex(parsed));
      }
      return parsed;
    }

    const scanned = await scanRunsDirForIndex();
    if (options?.repair === true && (scanned.length > 0 || loaded !== null)) {
      await withRunIndexWriteLock(() => writeRunIndex(scanned));
    }
    return scanned;
  }

  async function upsertRunIndexEntry(entry: RunIndexEntry): Promise<void> {
    await withRunIndexWriteLock(async () => {
      const entries = await readRunIndex({ repair: true });
      const next = entries.filter((row) => row.id !== entry.id);
      next.push(entry);
      await writeRunIndex(next);
    });
  }

  async function removeRunIndexEntry(id: string): Promise<void> {
    await withRunIndexWriteLock(async () => {
      const entries = await readRunIndex({ repair: true });
      const next = entries.filter((row) => row.id !== id);
      if (next.length === entries.length) return;
      await writeRunIndex(next);
    });
  }

  async function rebuildRunIndexFromDisk(): Promise<{
    entries: number;
    indexPath: string;
  }> {
    return withRunIndexWriteLock(async () => {
      const scanned = await scanRunsDirForIndex();
      await writeRunIndex(scanned);
      return {
        entries: scanned.length,
        indexPath: normalizeRelativePath(resolveRunsIndexPath()),
      };
    });
  }

  return {
    read: readRunIndex,
    scan: scanRunsDirForIndex,
    rebuild: rebuildRunIndexFromDisk,
    upsert: upsertRunIndexEntry,
    remove: removeRunIndexEntry,
  };
}
