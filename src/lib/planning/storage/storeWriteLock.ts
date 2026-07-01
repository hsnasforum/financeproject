import { AsyncLocalStorage } from "node:async_hooks";
import { resolvePlanningUserId } from "../store/namespace";

const writeQueues = new Map<string, Promise<void>>();
const heldWriteLocks = new AsyncLocalStorage<ReadonlySet<string>>();

function normalizeLockKey(key: string): string {
  const normalized = key.trim();
  if (!normalized) throw new Error("store write lock key is required");
  return normalized;
}

export async function withStoreWriteLock<T>(key: string, callback: () => Promise<T> | T): Promise<T> {
  const lockKey = normalizeLockKey(key);
  const held = heldWriteLocks.getStore();
  if (held?.has(lockKey)) {
    return callback();
  }

  const previous = writeQueues.get(lockKey) ?? Promise.resolve();
  let releaseCurrent: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const next = previous.catch(() => undefined).then(() => current);
  writeQueues.set(lockKey, next);

  await previous.catch(() => undefined);

  const nextHeld = new Set(held ?? []);
  nextHeld.add(lockKey);
  try {
    return await heldWriteLocks.run(nextHeld, callback);
  } finally {
    releaseCurrent();
    if (writeQueues.get(lockKey) === next) {
      writeQueues.delete(lockKey);
    }
  }
}

export function planningStoreWriteLockKey(storeKey: string): string {
  return `${resolvePlanningUserId()}::${normalizeLockKey(storeKey)}`;
}

export function withPlanningStoreWriteLock<T>(
  storeKey: string,
  callback: () => Promise<T> | T,
): Promise<T> {
  return withStoreWriteLock(planningStoreWriteLockKey(storeKey), callback);
}
