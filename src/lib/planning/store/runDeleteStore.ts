import {
  deleteRunMetaFromTrash,
  hardDeleteRunFiles,
  moveRunMetaToTrash,
  restoreRunMetaFromTrash,
} from "./runTrashStore";
import {
  toRunIndexEntry,
  type RunIndexEntry,
} from "./runIndex";
import { sanitizeRecordId } from "./paths";
import { type PlanningRunRecord } from "./types";

export type RunDeleteStoreDependencies = {
  getRun: (id: string) => Promise<PlanningRunRecord | null>;
  removeIndexEntry: (id: string) => Promise<void>;
  upsertIndexEntry: (entry: RunIndexEntry) => Promise<void>;
};

export type RunDeleteStore = ReturnType<typeof createRunDeleteStore>;

export function createRunDeleteStore(dependencies: RunDeleteStoreDependencies) {
  async function hardDeleteRun(id: string): Promise<boolean> {
    const safeId = sanitizeRecordId(id);
    const existing = await dependencies.getRun(safeId);
    const deleted = await hardDeleteRunFiles({
      id: safeId,
      existing,
    });

    if (deleted) {
      await dependencies.removeIndexEntry(safeId);
    }

    return deleted;
  }

  async function restoreRunFromTrash(id: string): Promise<boolean> {
    const safeId = sanitizeRecordId(id);
    const restored = await restoreRunMetaFromTrash(safeId);

    if (!restored) return false;
    const run = await dependencies.getRun(safeId);
    if (run) {
      await dependencies.upsertIndexEntry(toRunIndexEntry(run));
    }
    return true;
  }

  async function hardDeleteRunFromTrash(id: string): Promise<boolean> {
    const safeId = sanitizeRecordId(id);
    return deleteRunMetaFromTrash(safeId);
  }

  async function deleteRun(id: string): Promise<boolean> {
    const safeId = sanitizeRecordId(id);
    const existing = await dependencies.getRun(safeId);
    const moved = await moveRunMetaToTrash({
      id: safeId,
      existing,
    });

    if (!moved) return false;

    await dependencies.removeIndexEntry(safeId);
    return true;
  }

  return {
    deleteRun,
    hardDeleteRun,
    hardDeleteRunFromTrash,
    restoreRunFromTrash,
  };
}
