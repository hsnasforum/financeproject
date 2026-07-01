import { hasLegacyBatch } from "./transactionStore";
import {
  getBatchMeta,
  getBatchTransactions,
} from "../store/batchesStore";

export type StoredBatchCommandSurfaceState = "stored-meta" | "synthetic-stored-only" | "missing";
export type StoredBatchAccountCommandSurfaceState =
  | "stored-meta-only"
  | "stored-meta-legacy-coexistence"
  | "synthetic-stored-only"
  | "legacy-only"
  | "missing";
export type StoredBatchDeleteSurfaceState =
  | "stored-meta"
  | "stored-meta-legacy-coexistence"
  | "synthetic-stored-only"
  | "synthetic-stored-only-legacy-collision"
  | "legacy-only"
  | "missing";

export async function getStoredBatchCommandSurfaceState(batchId: string): Promise<StoredBatchCommandSurfaceState> {
  // Read surfaces can synthesize a batch from stored rows only, but command routes
  // still need to distinguish indexed writer-owned batches from synthetic read-only ones.
  const [storedMeta, storedTransactions] = await Promise.all([
    getBatchMeta(batchId).catch(() => null),
    getBatchTransactions(batchId).catch(() => []),
  ]);
  if (storedMeta) return "stored-meta";
  if (storedTransactions.length > 0) return "synthetic-stored-only";
  return "missing";
}

export async function getStoredBatchAccountCommandSurfaceState(
  batchId: string,
): Promise<StoredBatchAccountCommandSurfaceState> {
  const commandSurface = await getStoredBatchCommandSurfaceState(batchId);
  if (commandSurface === "synthetic-stored-only") return commandSurface;

  const legacyBatchExists = await hasLegacyBatch(batchId).catch(() => false);
  if (!legacyBatchExists) {
    if (commandSurface === "stored-meta") return "stored-meta-only";
    return commandSurface;
  }

  // Account binding still writes through the legacy batch owner.
  // When stored metadata with the same id already exists, user-facing read surfaces
  // can keep the visible binding on the stored-first side, so command success would
  // overstate what the user continues to see immediately after POST /account.
  if (commandSurface === "stored-meta") return "stored-meta-legacy-coexistence";
  return "legacy-only";
}

export async function getStoredBatchDeleteSurfaceState(batchId: string): Promise<StoredBatchDeleteSurfaceState> {
  const commandSurface = await getStoredBatchCommandSurfaceState(batchId);
  const legacyBatchExists = await hasLegacyBatch(batchId).catch(() => false);
  if (!legacyBatchExists) return commandSurface;

  // User-facing DELETE should not overstate removal when the legacy bridge still
  // resolves the same id after stored-side deletion.
  if (commandSurface === "missing") return "legacy-only";
  if (commandSurface === "stored-meta") return "stored-meta-legacy-coexistence";
  return "synthetic-stored-only-legacy-collision";
}
