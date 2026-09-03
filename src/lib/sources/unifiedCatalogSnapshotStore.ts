import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

type TimerHandle = ReturnType<typeof setInterval>;

export type CatalogSnapshotValue = {
  signature: string;
  items: readonly unknown[];
};

export type CatalogSnapshotEntry<T extends CatalogSnapshotValue> = {
  id: string;
  value: T;
  createdAt: number;
  lastAccessedAt: number;
  retainedRows: number;
  estimatedBytes: number;
};

export type CatalogSnapshotStoreStats = {
  snapshotCount: number;
  retainedCursorCount: 0;
  retainedRows: number;
  estimatedBytes: number;
  lruSnapshotIds: string[];
  inFlightBuildCount: number;
  activeSubscriberCount: number;
};

export type CatalogSnapshotSharedBuildInput<R> = {
  signature: string;
  callerSignal?: AbortSignal;
  build: (signal: AbortSignal) => Promise<R>;
};

export type CatalogSnapshotStoreConfig<T extends CatalogSnapshotValue> = {
  ttlMs: number;
  sweepIntervalMs: number;
  maxSnapshots: number;
  maxRetainedRows: number;
  maxEstimatedBytes: number;
  now?: () => number;
  estimateBytes?: (value: T) => number;
  createId?: () => string;
  schedule?: (callback: () => void, intervalMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
};

export type CatalogSnapshotPutResult<T extends CatalogSnapshotValue> =
  | {
      stored: true;
      reused: boolean;
      entry: CatalogSnapshotEntry<T>;
    }
  | {
      stored: false;
      reason: "SNAPSHOT_RESOURCE_LIMIT";
      retainedRows: number;
      estimatedBytes: number;
    };

function defaultEstimateBytes(value: CatalogSnapshotValue): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function createAbortAwareBuildPromise<R>(
  controller: AbortController,
  build: (signal: AbortSignal) => Promise<R>,
): Promise<R> {
  const rawBuildPromise = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw createAbortError();
    return build(controller.signal);
  });

  return new Promise<R>((resolve, reject) => {
    let completed = false;
    const finish = (complete: () => void) => {
      if (completed) return;
      completed = true;
      controller.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () => {
      finish(() => reject(createAbortError()));
    };

    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();

    // Keep both handlers attached so a non-cooperative build cannot surface a late unhandled rejection.
    void rawBuildPromise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

type CatalogSnapshotInFlightEntry = {
  signature: string;
  generation: number;
  controller: AbortController;
  promise: Promise<unknown>;
  activeSubscribers: number;
  settled: boolean;
  invalidatedByTeardown: boolean;
};

export class BoundedCatalogSnapshotStore<T extends CatalogSnapshotValue> {
  private readonly entries = new Map<string, CatalogSnapshotEntry<T>>();
  private readonly signatureIndex = new Map<string, string>();
  private readonly inFlightBuilds = new Map<string, CatalogSnapshotInFlightEntry>();
  private readonly now: () => number;
  private readonly estimateBytes: (value: T) => number;
  private readonly createId: () => string;
  private readonly schedule: (callback: () => void, intervalMs: number) => TimerHandle;
  private readonly cancel: (handle: TimerHandle) => void;
  private timer: TimerHandle | null = null;
  private retainedRows = 0;
  private estimatedBytes = 0;
  private teardownGeneration = 0;

  constructor(private readonly config: CatalogSnapshotStoreConfig<T>) {
    assertPositiveInteger("ttlMs", config.ttlMs);
    assertPositiveInteger("sweepIntervalMs", config.sweepIntervalMs);
    assertPositiveInteger("maxSnapshots", config.maxSnapshots);
    assertPositiveInteger("maxRetainedRows", config.maxRetainedRows);
    assertPositiveInteger("maxEstimatedBytes", config.maxEstimatedBytes);
    this.now = config.now ?? Date.now;
    this.estimateBytes = config.estimateBytes ?? defaultEstimateBytes;
    this.createId = config.createId ?? randomUUID;
    this.schedule = config.schedule ?? ((callback, intervalMs) => setInterval(callback, intervalMs));
    this.cancel = config.cancel ?? ((handle) => clearInterval(handle));
  }

  getById(id: string): CatalogSnapshotEntry<T> | null {
    this.sweepExpired();
    const entry = this.entries.get(id);
    if (!entry) return null;
    return this.touch(entry);
  }

  getBySignature(signature: string): CatalogSnapshotEntry<T> | null {
    this.sweepExpired();
    const id = this.signatureIndex.get(signature);
    if (!id) return null;
    const entry = this.entries.get(id);
    if (!entry) {
      this.signatureIndex.delete(signature);
      return null;
    }
    return this.touch(entry);
  }

  put(value: T): CatalogSnapshotPutResult<T> {
    this.sweepExpired();
    const existing = this.getBySignature(value.signature);
    if (existing) return { stored: true, reused: true, entry: existing };

    const retainedRows = value.items.length;
    const estimatedBytes = this.estimateBytes(value);
    if (
      retainedRows > this.config.maxRetainedRows
      || !Number.isFinite(estimatedBytes)
      || estimatedBytes > this.config.maxEstimatedBytes
    ) {
      return {
        stored: false,
        reason: "SNAPSHOT_RESOURCE_LIMIT",
        retainedRows,
        estimatedBytes,
      };
    }

    while (
      this.entries.size >= this.config.maxSnapshots
      || this.retainedRows + retainedRows > this.config.maxRetainedRows
      || this.estimatedBytes + estimatedBytes > this.config.maxEstimatedBytes
    ) {
      if (!this.evictOldest()) break;
    }

    let id = this.createId();
    while (!id || this.entries.has(id)) id = this.createId();
    const createdAt = this.now();
    const entry: CatalogSnapshotEntry<T> = {
      id,
      value,
      createdAt,
      lastAccessedAt: createdAt,
      retainedRows,
      estimatedBytes,
    };
    this.entries.set(id, entry);
    this.signatureIndex.set(value.signature, id);
    this.retainedRows += retainedRows;
    this.estimatedBytes += estimatedBytes;
    this.ensureSweepTimer();
    return { stored: true, reused: false, entry };
  }

  runSharedBuild<R>(input: CatalogSnapshotSharedBuildInput<R>): Promise<R> {
    if (input.callerSignal?.aborted) return Promise.reject(createAbortError());

    let entry = this.inFlightBuilds.get(input.signature);
    if (!entry || entry.settled || entry.controller.signal.aborted) {
      const controller = new AbortController();
      const promise = createAbortAwareBuildPromise(controller, input.build);
      const createdEntry: CatalogSnapshotInFlightEntry = {
        signature: input.signature,
        generation: this.teardownGeneration,
        controller,
        promise,
        activeSubscribers: 0,
        settled: false,
        invalidatedByTeardown: false,
      };
      this.inFlightBuilds.set(input.signature, createdEntry);
      void promise.then(
        () => this.finishSharedBuild(createdEntry),
        () => this.finishSharedBuild(createdEntry),
      );
      entry = createdEntry;
    }

    return this.subscribeToSharedBuild<R>(entry, input.callerSignal);
  }

  runInCurrentTeardownGeneration<R>(
    operation: () => Promise<R>,
    callerSignal?: AbortSignal,
  ): Promise<R> {
    const generation = this.teardownGeneration;
    if (callerSignal?.aborted) return Promise.reject(createAbortError());

    let operationPromise: Promise<R>;
    try {
      operationPromise = operation();
    } catch (error) {
      operationPromise = Promise.reject(error);
    }

    return operationPromise.then(
      (value) => {
        if (generation !== this.teardownGeneration || callerSignal?.aborted) {
          throw createAbortError();
        }
        return value;
      },
      (error: unknown) => {
        if (generation !== this.teardownGeneration || callerSignal?.aborted) {
          throw createAbortError();
        }
        throw error;
      },
    );
  }

  delete(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    if (this.signatureIndex.get(entry.value.signature) === id) {
      this.signatureIndex.delete(entry.value.signature);
    }
    this.retainedRows -= entry.retainedRows;
    this.estimatedBytes -= entry.estimatedBytes;
    if (this.entries.size === 0) this.stopSweepTimer();
    return true;
  }

  sweepExpired(now = this.now()): number {
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt < this.config.ttlMs) continue;
      if (this.delete(id)) removed += 1;
    }
    return removed;
  }

  stats(): CatalogSnapshotStoreStats {
    return {
      snapshotCount: this.entries.size,
      retainedCursorCount: 0,
      retainedRows: this.retainedRows,
      estimatedBytes: this.estimatedBytes,
      lruSnapshotIds: [...this.entries.keys()],
      inFlightBuildCount: this.inFlightBuilds.size,
      activeSubscriberCount: [...this.inFlightBuilds.values()]
        .reduce((total, entry) => total + entry.activeSubscribers, 0),
    };
  }

  clear(): void {
    this.teardownGeneration = this.teardownGeneration === Number.MAX_SAFE_INTEGER
      ? 0
      : this.teardownGeneration + 1;
    for (const entry of this.inFlightBuilds.values()) {
      entry.invalidatedByTeardown = true;
      entry.controller.abort();
    }
    this.inFlightBuilds.clear();
    this.entries.clear();
    this.signatureIndex.clear();
    this.retainedRows = 0;
    this.estimatedBytes = 0;
    this.stopSweepTimer();
  }

  dispose(): void {
    this.clear();
  }

  private touch(entry: CatalogSnapshotEntry<T>): CatalogSnapshotEntry<T> {
    entry.lastAccessedAt = this.now();
    this.entries.delete(entry.id);
    this.entries.set(entry.id, entry);
    return entry;
  }

  private subscribeToSharedBuild<R>(
    entry: CatalogSnapshotInFlightEntry,
    callerSignal: AbortSignal | undefined,
  ): Promise<R> {
    entry.activeSubscribers += 1;
    return new Promise<R>((resolve, reject) => {
      let released = false;
      let completed = false;
      const release = () => {
        if (released) return;
        released = true;
        entry.activeSubscribers -= 1;
        if (entry.activeSubscribers === 0 && !entry.settled) {
          entry.controller.abort();
          if (this.inFlightBuilds.get(entry.signature) === entry) {
            this.inFlightBuilds.delete(entry.signature);
          }
        }
      };
      const finishCaller = (complete: () => void) => {
        if (completed) return;
        completed = true;
        callerSignal?.removeEventListener("abort", onAbort);
        release();
        complete();
      };
      const onAbort = () => {
        finishCaller(() => reject(createAbortError()));
      };
      const finishFromEntry = (complete: () => void) => {
        if (
          entry.generation !== this.teardownGeneration
          || entry.invalidatedByTeardown
          || entry.controller.signal.aborted
        ) {
          finishCaller(() => reject(createAbortError()));
          return;
        }
        finishCaller(complete);
      };

      callerSignal?.addEventListener("abort", onAbort, { once: true });
      if (callerSignal?.aborted) {
        onAbort();
        return;
      }

      void entry.promise.then(
        (value) => finishFromEntry(() => resolve(value as R)),
        (error: unknown) => finishFromEntry(() => reject(error)),
      );
    });
  }

  private finishSharedBuild(entry: CatalogSnapshotInFlightEntry): void {
    entry.settled = true;
    if (this.inFlightBuilds.get(entry.signature) === entry) {
      this.inFlightBuilds.delete(entry.signature);
    }
  }

  private evictOldest(): boolean {
    const oldestId = this.entries.keys().next().value as string | undefined;
    return oldestId ? this.delete(oldestId) : false;
  }

  private ensureSweepTimer(): void {
    if (this.timer) return;
    this.timer = this.schedule(() => {
      this.sweepExpired();
    }, Math.min(this.config.sweepIntervalMs, this.config.ttlMs));
    const unref = (this.timer as TimerHandle & { unref?: () => void }).unref;
    if (typeof unref === "function") unref.call(this.timer);
  }

  private stopSweepTimer(): void {
    if (!this.timer) return;
    this.cancel(this.timer);
    this.timer = null;
  }
}

const catalogCursorSigningKey = randomBytes(32);

export type UnifiedCatalogPageCursor = {
  snapshotId: string;
  offset: number;
};

function cursorMac(payload: string): string {
  return createHmac("sha256", catalogCursorSigningKey).update(payload).digest("base64url");
}

export function encodeUnifiedCatalogPageCursor(cursor: UnifiedCatalogPageCursor): string {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    snapshotId: cursor.snapshotId,
    offset: cursor.offset,
  }), "utf8").toString("base64url");
  return `${payload}.${cursorMac(payload)}`;
}

export function decodeUnifiedCatalogPageCursor(cursor: string): UnifiedCatalogPageCursor | null {
  try {
    const [payload, providedMac, ...extra] = cursor.split(".");
    if (!payload || !providedMac || extra.length > 0) return null;
    const expected = Buffer.from(cursorMac(payload), "base64url");
    const provided = Buffer.from(providedMac, "base64url");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      v?: unknown;
      snapshotId?: unknown;
      offset?: unknown;
    };
    if (parsed.v !== 1 || typeof parsed.snapshotId !== "string" || parsed.snapshotId.length < 8) return null;
    if (!Number.isSafeInteger(parsed.offset) || Number(parsed.offset) <= 0) return null;
    return { snapshotId: parsed.snapshotId, offset: Number(parsed.offset) };
  } catch {
    return null;
  }
}
