import { describe, expect, it, vi } from "vitest";
import {
  BoundedCatalogSnapshotStore,
  decodeUnifiedCatalogPageCursor,
  encodeUnifiedCatalogPageCursor,
} from "../src/lib/sources/unifiedCatalogSnapshotStore";

type Snapshot = {
  signature: string;
  items: Array<{ id: string }>;
};

function snapshot(signature: string, rows: number): Snapshot {
  return {
    signature,
    items: Array.from({ length: rows }, (_, index) => ({ id: `${signature}-${index}` })),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function deferredThenable<T>() {
  const attached = deferred<void>();
  let fulfillThenable: ((value: T) => unknown) | undefined;
  let rejectThenable: ((reason?: unknown) => unknown) | undefined;
  const promise = {
    then(
      onFulfilled: (value: T) => unknown,
      onRejected: (reason?: unknown) => unknown,
    ) {
      fulfillThenable = onFulfilled;
      rejectThenable = onRejected;
      attached.resolve();
    },
  } as unknown as Promise<T>;

  return {
    promise,
    attached: attached.promise,
    fulfill(value: T) {
      if (!fulfillThenable) throw new Error("thenable fulfillment handler is not attached");
      fulfillThenable(value);
    },
    reject(reason: unknown) {
      if (!rejectThenable) throw new Error("thenable rejection handler is not attached");
      rejectThenable(reason);
    },
  };
}

function settleBeforeQueuedTeardown(settle: () => void, teardown: () => void): void {
  settle();
  queueMicrotask(teardown);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createStore(input: Partial<{
  ttlMs: number;
  maxSnapshots: number;
  maxRetainedRows: number;
  maxEstimatedBytes: number;
  now: () => number;
  estimateBytes: (value: Snapshot) => number;
  createId: () => string;
  schedule: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  cancel: (handle: ReturnType<typeof setInterval>) => void;
}> = {}) {
  let id = 0;
  return new BoundedCatalogSnapshotStore<Snapshot>({
    ttlMs: input.ttlMs ?? 1_000,
    sweepIntervalMs: 100,
    maxSnapshots: input.maxSnapshots ?? 4,
    maxRetainedRows: input.maxRetainedRows ?? 100,
    maxEstimatedBytes: input.maxEstimatedBytes ?? 1_000,
    now: input.now,
    estimateBytes: input.estimateBytes ?? ((value) => value.items.length * 10),
    createId: input.createId ?? (() => `snapshot-${++id}`),
    schedule: input.schedule,
    cancel: input.cancel,
  });
}

describe("bounded unified catalog snapshot store", () => {
  it("uses a signed opaque page cursor with only snapshot identity and offset", () => {
    const cursor = encodeUnifiedCatalogPageCursor({ snapshotId: "snapshot-123", offset: 40 });
    const [payload, mac] = cursor.split(".");
    const tamperedMac = `${mac.startsWith("a") ? "b" : "a"}${mac.slice(1)}`;

    expect(decodeUnifiedCatalogPageCursor(cursor)).toEqual({ snapshotId: "snapshot-123", offset: 40 });
    expect(decodeUnifiedCatalogPageCursor(`${payload}.${tamperedMac}`)).toBeNull();
    expect(decodeUnifiedCatalogPageCursor("not-a-cursor")).toBeNull();
    expect(JSON.stringify(decodeUnifiedCatalogPageCursor(cursor))).not.toContain("items");
  });

  it("reuses one snapshot per signature without retaining page cursor state", () => {
    const store = createStore();
    const first = store.put(snapshot("same", 3));
    const repeated = store.put(snapshot("same", 9));

    expect(first.stored).toBe(true);
    expect(repeated.stored).toBe(true);
    if (!first.stored || !repeated.stored) throw new Error("snapshot should be stored");
    expect(repeated.reused).toBe(true);
    expect(repeated.entry.id).toBe(first.entry.id);
    expect(store.stats()).toEqual({
      snapshotCount: 1,
      retainedCursorCount: 0,
      retainedRows: 3,
      estimatedBytes: 30,
      lruSnapshotIds: [first.entry.id],
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    });
    store.dispose();
  });

  it("shares one build while isolating each caller abort", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const release = deferred<string>();
    const build = vi.fn(async (signal: AbortSignal) => {
      started.resolve(signal);
      return release.promise;
    });
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = store.runSharedBuild({
      signature: "same",
      callerSignal: firstController.signal,
      build,
    });
    const second = store.runSharedBuild({
      signature: "same",
      callerSignal: secondController.signal,
      build,
    });
    const firstOutcome = first.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    const sharedSignal = await started.promise;

    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 1,
      activeSubscriberCount: 2,
    }));
    firstController.abort();
    expect((await firstOutcome)).toEqual({
      status: "rejected",
      error: expect.objectContaining({ name: "AbortError" }),
    });
    expect(sharedSignal.aborted).toBe(false);
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 1,
      activeSubscriberCount: 1,
    }));

    release.resolve("shared-result");
    await expect(second).resolves.toBe("shared-result");
    expect(build).toHaveBeenCalledTimes(1);
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    store.dispose();
  });

  it("rejects an already-aborted caller without starting a build", async () => {
    const store = createStore();
    const controller = new AbortController();
    controller.abort();
    const build = vi.fn(async () => "unused");

    await expect(store.runSharedBuild({
      signature: "aborted",
      callerSignal: controller.signal,
      build,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(build).not.toHaveBeenCalled();
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    store.dispose();
  });

  it("cancels an all-aborted build and keeps a new same-signature build registered", async () => {
    const store = createStore();
    const firstStarted = deferred<AbortSignal>();
    const retryStarted = deferred<AbortSignal>();
    const retryRelease = deferred<string>();
    let invocation = 0;
    const build = vi.fn((signal: AbortSignal): Promise<string> => {
      invocation += 1;
      if (invocation === 1) {
        firstStarted.resolve(signal);
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("cancelled", "AbortError"));
          }, { once: true });
        });
      }
      retryStarted.resolve(signal);
      return retryRelease.promise;
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = store.runSharedBuild({ signature: "race", callerSignal: firstController.signal, build });
    const second = store.runSharedBuild({ signature: "race", callerSignal: secondController.signal, build });
    const oldOutcomes = Promise.allSettled([first, second]);
    const oldSignal = await firstStarted.promise;

    firstController.abort();
    expect(oldSignal.aborted).toBe(false);
    secondController.abort();
    expect(oldSignal.aborted).toBe(true);
    const retry = store.runSharedBuild({ signature: "race", build });
    const retrySignal = await retryStarted.promise;
    await Promise.resolve();

    expect(retrySignal.aborted).toBe(false);
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 1,
      activeSubscriberCount: 1,
    }));
    retryRelease.resolve("retry-result");
    await expect(retry).resolves.toBe("retry-result");
    const outcomes = await oldOutcomes;
    expect(outcomes).toEqual([
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) }),
    ]);
    expect(build).toHaveBeenCalledTimes(2);
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    store.dispose();
  });

  it("shares a build failure and allows the next request to retry", async () => {
    const store = createStore();
    const expectedError = new Error("snapshot build failed");
    const build = vi.fn()
      .mockRejectedValueOnce(expectedError)
      .mockResolvedValueOnce("recovered");

    const first = store.runSharedBuild({ signature: "failure", build });
    const second = store.runSharedBuild({ signature: "failure", build });
    const outcomes = await Promise.allSettled([first, second]);

    expect(outcomes).toEqual([
      { status: "rejected", reason: expectedError },
      { status: "rejected", reason: expectedError },
    ]);
    expect(build).toHaveBeenCalledTimes(1);
    await expect(store.runSharedBuild({ signature: "failure", build })).resolves.toBe("recovered");
    expect(build).toHaveBeenCalledTimes(2);
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    store.dispose();
  });

  it("aborts and removes in-flight work when the store is cleared", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const build = vi.fn((signal: AbortSignal) => {
      started.resolve(signal);
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("cleared", "AbortError"));
        }, { once: true });
      });
    });
    const pending = store.runSharedBuild({ signature: "clear", build });
    const outcome = pending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    const signal = await started.promise;

    store.clear();

    expect(signal.aborted).toBe(true);
    expect(await outcome).toEqual({
      status: "rejected",
      error: expect.objectContaining({ name: "AbortError" }),
    });
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 0,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    store.dispose();
  });

  it.each(["clear", "dispose"] as const)(
    "prioritizes %s over queued shared success before the subscriber reaction",
    async (teardownMethod) => {
      const store = createStore();
      const started = deferred<AbortSignal>();
      const buildResult = deferredThenable<string>();
      const callerController = new AbortController();
      const callerRemove = vi.spyOn(callerController.signal, "removeEventListener");
      let settlementCount = 0;
      const pending = store.runSharedBuild({
        signature: `queued-success-${teardownMethod}`,
        callerSignal: callerController.signal,
        build: (signal) => {
          started.resolve(signal);
          return buildResult.promise;
        },
      });
      const outcome = pending.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      ).finally(() => {
        settlementCount += 1;
      });
      const sharedSignal = await started.promise;
      await buildResult.attached;
      const internalRemove = vi.spyOn(sharedSignal, "removeEventListener");
      let teardownWindow: {
        internalRemoveCalls: number;
        callerRemoveCalls: number;
        settlementCount: number;
      } | undefined;

      settleBeforeQueuedTeardown(
        () => buildResult.fulfill("raw-success"),
        () => {
          teardownWindow = {
            internalRemoveCalls: internalRemove.mock.calls.length,
            callerRemoveCalls: callerRemove.mock.calls.length,
            settlementCount,
          };
          if (teardownMethod === "clear") store.clear();
          else store.dispose();
        },
      );

      expect(await outcome).toEqual({
        status: "rejected",
        error: expect.objectContaining({ name: "AbortError" }),
      });
      expect(teardownWindow).toEqual({
        internalRemoveCalls: 1,
        callerRemoveCalls: 0,
        settlementCount: 0,
      });
      expect(settlementCount).toBe(1);
      expect(callerRemove).toHaveBeenCalledTimes(1);
      expect(internalRemove).toHaveBeenCalledTimes(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
      store.dispose();
    },
  );

  it("prioritizes clear over queued shared rejection without exposing the original error", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const buildResult = deferredThenable<string>();
    const expectedError = new Error("raw-failure");
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    let settlementCount = 0;
    process.on("unhandledRejection", onUnhandledRejection);
    const pending = store.runSharedBuild({
      signature: "queued-rejection-clear",
      build: (signal) => {
        started.resolve(signal);
        return buildResult.promise;
      },
    });
    const outcome = pending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      settlementCount += 1;
    });
    const sharedSignal = await started.promise;
    await buildResult.attached;
    const internalRemove = vi.spyOn(sharedSignal, "removeEventListener");
    let teardownWindow: { internalRemoveCalls: number; settlementCount: number } | undefined;

    try {
      settleBeforeQueuedTeardown(
        () => buildResult.reject(expectedError),
        () => {
          teardownWindow = {
            internalRemoveCalls: internalRemove.mock.calls.length,
            settlementCount,
          };
          store.clear();
        },
      );

      const result = await outcome;
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(result).toEqual({
        status: "rejected",
        error: expect.objectContaining({ name: "AbortError" }),
      });
      if (result.status !== "rejected") throw new Error("expected subscriber rejection");
      expect(result.error).not.toBe(expectedError);
      expect(teardownWindow).toEqual({ internalRemoveCalls: 1, settlementCount: 0 });
      expect(settlementCount).toBe(1);
      expect(internalRemove).toHaveBeenCalledTimes(1);
      expect(unhandledRejections).toEqual([]);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
      store.dispose();
    }
  });

  it("aborts every queued subscriber exactly once when clear follows shared success", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const buildResult = deferredThenable<string>();
    const subscribers = Array.from({ length: 3 }, () => store.runSharedBuild({
      signature: "queued-success-multiple-clear",
      build: (signal) => {
        started.resolve(signal);
        return buildResult.promise;
      },
    }));
    const settlementCounts = [0, 0, 0];
    const rawSuccessDeliveries: string[] = [];
    const outcomes = subscribers.map((subscriber, index) => subscriber.then(
      (value) => {
        rawSuccessDeliveries.push(value);
        return { status: "fulfilled" as const, value };
      },
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      settlementCounts[index] += 1;
    }));
    const sharedSignal = await started.promise;
    await buildResult.attached;
    const internalRemove = vi.spyOn(sharedSignal, "removeEventListener");
    let teardownWindow: { internalRemoveCalls: number; settlementCounts: number[] } | undefined;

    settleBeforeQueuedTeardown(
      () => buildResult.fulfill("raw-success"),
      () => {
        teardownWindow = {
          internalRemoveCalls: internalRemove.mock.calls.length,
          settlementCounts: [...settlementCounts],
        };
        store.clear();
      },
    );

    expect(await Promise.all(outcomes)).toEqual([
      { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
      { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
      { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
    ]);
    expect(teardownWindow).toEqual({ internalRemoveCalls: 1, settlementCounts: [0, 0, 0] });
    expect(settlementCounts).toEqual([1, 1, 1]);
    expect(rawSuccessDeliveries).toEqual([]);
    expect(internalRemove).toHaveBeenCalledTimes(1);
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 0,
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    store.dispose();
  });

  it("keeps an immediate same-signature retry isolated from old queued reactions", async () => {
    const store = createStore();
    const oldStarted = deferred<AbortSignal>();
    const oldBuildResult = deferredThenable<string>();
    const retryStarted = deferred<AbortSignal>();
    const retryRelease = deferred<string>();
    let oldSettlementCount = 0;
    let retry: Promise<string> | undefined;
    const oldPending = store.runSharedBuild({
      signature: "queued-clear-retry",
      build: (signal) => {
        oldStarted.resolve(signal);
        return oldBuildResult.promise;
      },
    });
    const oldOutcome = oldPending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      oldSettlementCount += 1;
    });
    const oldSignal = await oldStarted.promise;
    await oldBuildResult.attached;
    const internalRemove = vi.spyOn(oldSignal, "removeEventListener");
    let teardownWindow: { internalRemoveCalls: number; oldSettlementCount: number } | undefined;

    settleBeforeQueuedTeardown(
      () => oldBuildResult.fulfill("old-success"),
      () => {
        teardownWindow = {
          internalRemoveCalls: internalRemove.mock.calls.length,
          oldSettlementCount,
        };
        store.clear();
        retry = store.runSharedBuild({
          signature: "queued-clear-retry",
          build: (signal) => {
            retryStarted.resolve(signal);
            return retryRelease.promise;
          },
        });
      },
    );

    const retrySignal = await retryStarted.promise;
    expect(await oldOutcome).toEqual({
      status: "rejected",
      error: expect.objectContaining({ name: "AbortError" }),
    });
    expect(teardownWindow).toEqual({ internalRemoveCalls: 1, oldSettlementCount: 0 });
    expect(oldSettlementCount).toBe(1);
    expect(oldSignal.aborted).toBe(true);
    expect(retrySignal.aborted).toBe(false);
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 1,
      activeSubscriberCount: 1,
    }));

    retryRelease.resolve("retry-success");
    if (!retry) throw new Error("expected same-signature retry");
    await expect(retry).resolves.toBe("retry-success");
    expect(oldSettlementCount).toBe(1);
    expect(store.stats()).toEqual(expect.objectContaining({
      inFlightBuildCount: 0,
      activeSubscriberCount: 0,
    }));
    store.dispose();
  });

  it("settles every subscriber on clear when the shared build ignores abort and resolves late", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const release = deferred<string>();
    const build = vi.fn((signal: AbortSignal) => {
      started.resolve(signal);
      return release.promise;
    });
    const subscribers = Array.from({ length: 3 }, () => store.runSharedBuild({
      signature: "clear-ignored-signal",
      build,
    }));
    const settlementCounts = [0, 0, 0];
    const outcomes = subscribers.map((subscriber, index) => subscriber.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      settlementCounts[index] += 1;
    }));
    const signal = await started.promise;

    try {
      store.clear();
      await flushMicrotasks();

      expect(signal.aborted).toBe(true);
      expect(settlementCounts).toEqual([1, 1, 1]);
      expect(await Promise.all(outcomes)).toEqual([
        { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
        { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
        { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
      ]);
      expect(build).toHaveBeenCalledTimes(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));

      release.resolve("late-success");
      await flushMicrotasks();

      expect(settlementCounts).toEqual([1, 1, 1]);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      release.resolve("cleanup");
      await Promise.allSettled(outcomes);
      store.dispose();
    }
  });

  it("settles a never-ending shared build on dispose and keeps teardown idempotent", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const release = deferred<string>();
    let settlementCount = 0;
    expect(store.put(snapshot("dispose-existing", 1)).stored).toBe(true);
    const pending = store.runSharedBuild({
      signature: "dispose-ignored-signal",
      build: (signal) => {
        started.resolve(signal);
        return release.promise;
      },
    });
    const outcome = pending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      settlementCount += 1;
    });
    const signal = await started.promise;

    try {
      store.dispose();
      store.dispose();
      store.clear();
      await flushMicrotasks();

      expect(signal.aborted).toBe(true);
      expect(settlementCount).toBe(1);
      expect(await outcome).toEqual({
        status: "rejected",
        error: expect.objectContaining({ name: "AbortError" }),
      });
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));

      release.resolve("late-success");
      await flushMicrotasks();

      expect(settlementCount).toBe(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      release.resolve("cleanup");
      await Promise.allSettled([outcome]);
      store.dispose();
    }
  });

  it("handles an ignored shared build rejection after clear without resettling subscribers", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const release = deferred<string>();
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    let settlementCount = 0;
    let rawBuildSettled = false;
    process.on("unhandledRejection", onUnhandledRejection);
    const pending = store.runSharedBuild({
      signature: "clear-late-rejection",
      build: (signal) => {
        started.resolve(signal);
        return release.promise;
      },
    });
    const outcome = pending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      settlementCount += 1;
    });
    await started.promise;

    try {
      store.clear();
      await flushMicrotasks();

      expect(settlementCount).toBe(1);
      expect(await outcome).toEqual({
        status: "rejected",
        error: expect.objectContaining({ name: "AbortError" }),
      });

      rawBuildSettled = true;
      release.reject(new Error("late build failure"));
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(unhandledRejections).toEqual([]);
      expect(settlementCount).toBe(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        snapshotCount: 0,
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      if (!rawBuildSettled) release.reject(new Error("cleanup"));
      await Promise.allSettled([outcome]);
      process.off("unhandledRejection", onUnhandledRejection);
      store.dispose();
    }
  });

  it("releases caller and internal abort listeners once when caller abort is followed by clear", async () => {
    const store = createStore();
    const started = deferred<AbortSignal>();
    const release = deferred<string>();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const firstAdd = vi.spyOn(firstController.signal, "addEventListener");
    const firstRemove = vi.spyOn(firstController.signal, "removeEventListener");
    const secondAdd = vi.spyOn(secondController.signal, "addEventListener");
    const secondRemove = vi.spyOn(secondController.signal, "removeEventListener");
    const build = vi.fn((signal: AbortSignal) => {
      started.resolve(signal);
      return release.promise;
    });
    const first = store.runSharedBuild({
      signature: "caller-then-clear",
      callerSignal: firstController.signal,
      build,
    });
    const second = store.runSharedBuild({
      signature: "caller-then-clear",
      callerSignal: secondController.signal,
      build,
    });
    const settlementCounts = [0, 0];
    const outcomes = [first, second].map((subscriber, index) => subscriber.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      settlementCounts[index] += 1;
    }));
    const sharedSignal = await started.promise;
    const internalRemove = vi.spyOn(sharedSignal, "removeEventListener");

    try {
      firstController.abort();
      await flushMicrotasks();

      expect(settlementCounts).toEqual([1, 0]);
      expect(sharedSignal.aborted).toBe(false);
      expect(store.stats()).toEqual(expect.objectContaining({
        inFlightBuildCount: 1,
        activeSubscriberCount: 1,
      }));

      store.clear();
      await flushMicrotasks();

      expect(sharedSignal.aborted).toBe(true);
      expect(settlementCounts).toEqual([1, 1]);
      expect(await Promise.all(outcomes)).toEqual([
        { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
        { status: "rejected", error: expect.objectContaining({ name: "AbortError" }) },
      ]);
      expect(firstAdd).toHaveBeenCalledTimes(1);
      expect(firstRemove).toHaveBeenCalledTimes(1);
      expect(secondAdd).toHaveBeenCalledTimes(1);
      expect(secondRemove).toHaveBeenCalledTimes(1);
      expect(internalRemove).toHaveBeenCalledTimes(1);
      expect(store.stats()).toEqual(expect.objectContaining({
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));

      release.resolve("late-success");
      await flushMicrotasks();
      expect(settlementCounts).toEqual([1, 1]);
    } finally {
      release.resolve("cleanup");
      await Promise.allSettled(outcomes);
      store.dispose();
    }
  });

  it.each([
    { name: "success", lateFailure: false },
    { name: "rejection", lateFailure: true },
  ])("keeps a new same-signature entry registered after clear and old late $name", async ({ lateFailure }) => {
    const store = createStore();
    const oldStarted = deferred<AbortSignal>();
    const retryStarted = deferred<AbortSignal>();
    const oldRelease = deferred<string>();
    const retryRelease = deferred<string>();
    let invocation = 0;
    const build = vi.fn((signal: AbortSignal) => {
      invocation += 1;
      if (invocation === 1) {
        oldStarted.resolve(signal);
        return oldRelease.promise;
      }
      retryStarted.resolve(signal);
      return retryRelease.promise;
    });
    let oldSettlementCount = 0;
    const oldPending = store.runSharedBuild({ signature: "clear-retry", build });
    const oldOutcome = oldPending.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ).finally(() => {
      oldSettlementCount += 1;
    });
    const oldSignal = await oldStarted.promise;

    try {
      store.clear();
      const retry = store.runSharedBuild({ signature: "clear-retry", build });
      const retrySignal = await retryStarted.promise;
      await flushMicrotasks();
      expect(oldSettlementCount).toBe(1);
      expect(await oldOutcome).toEqual({
        status: "rejected",
        error: expect.objectContaining({ name: "AbortError" }),
      });
      expect(oldSignal.aborted).toBe(true);
      expect(retrySignal.aborted).toBe(false);

      if (lateFailure) {
        oldRelease.reject(new Error("old late failure"));
      } else {
        oldRelease.resolve("old-late-success");
      }
      await flushMicrotasks();
      expect(store.stats()).toEqual(expect.objectContaining({
        inFlightBuildCount: 1,
        activeSubscriberCount: 1,
      }));

      retryRelease.resolve("retry-success");
      await expect(retry).resolves.toBe("retry-success");
      expect(build).toHaveBeenCalledTimes(2);
      expect(store.stats()).toEqual(expect.objectContaining({
        inFlightBuildCount: 0,
        activeSubscriberCount: 0,
      }));
    } finally {
      oldRelease.resolve("cleanup");
      retryRelease.resolve("cleanup");
      await Promise.allSettled([oldOutcome]);
      store.dispose();
    }
  });

  it("evicts the least recently used snapshot when the count budget is full", () => {
    const store = createStore({ maxSnapshots: 2 });
    const first = store.put(snapshot("first", 1));
    const second = store.put(snapshot("second", 1));
    if (!first.stored || !second.stored) throw new Error("snapshot should be stored");

    expect(store.getById(first.entry.id)?.value.signature).toBe("first");
    const third = store.put(snapshot("third", 1));
    if (!third.stored) throw new Error("snapshot should be stored");

    expect(store.getById(second.entry.id)).toBeNull();
    expect(store.getById(first.entry.id)?.value.signature).toBe("first");
    expect(store.getById(third.entry.id)?.value.signature).toBe("third");
    store.dispose();
  });

  it("enforces the aggregate row budget and rejects one row-oversized snapshot", () => {
    const store = createStore({
      maxRetainedRows: 4,
      maxEstimatedBytes: 1_000,
    });
    const first = store.put(snapshot("first", 2));
    const second = store.put(snapshot("second", 3));
    if (!first.stored || !second.stored) throw new Error("snapshot should be stored");

    expect(store.getById(first.entry.id)).toBeNull();
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 3,
      estimatedBytes: 30,
    }));

    const oversized = store.put(snapshot("oversized", 5));
    expect(oversized).toEqual({
      stored: false,
      reason: "SNAPSHOT_RESOURCE_LIMIT",
      retainedRows: 5,
      estimatedBytes: 50,
    });
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 3,
      estimatedBytes: 30,
    }));
    store.dispose();
  });

  it("enforces the aggregate estimated-byte budget and rejects one byte-oversized snapshot", () => {
    const store = createStore({
      maxRetainedRows: 100,
      maxEstimatedBytes: 35,
    });
    const first = store.put(snapshot("first", 2));
    const second = store.put(snapshot("second", 2));
    if (!first.stored || !second.stored) throw new Error("snapshot should be stored");

    expect(store.getById(first.entry.id)).toBeNull();
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 2,
      estimatedBytes: 20,
    }));

    const oversized = store.put(snapshot("oversized", 4));
    expect(oversized).toEqual({
      stored: false,
      reason: "SNAPSHOT_RESOURCE_LIMIT",
      retainedRows: 4,
      estimatedBytes: 40,
    });
    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 1,
      retainedRows: 2,
      estimatedBytes: 20,
    }));
    store.dispose();
  });

  it("keeps repeated large inserts inside the aggregate retained-resource ceiling", () => {
    const store = createStore({
      maxSnapshots: 10,
      maxRetainedRows: 5,
      maxEstimatedBytes: 50,
    });

    for (let index = 0; index < 10; index += 1) {
      expect(store.put(snapshot(`large-${index}`, 2)).stored).toBe(true);
      expect(store.stats().retainedRows).toBeLessThanOrEqual(5);
      expect(store.stats().estimatedBytes).toBeLessThanOrEqual(50);
    }

    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 2,
      retainedRows: 4,
      estimatedBytes: 40,
      retainedCursorCount: 0,
    }));
    store.dispose();
  });

  it("actively sweeps expired snapshots with an unref timer", () => {
    let now = 0;
    let sweep: (() => void) | undefined;
    const unref = vi.fn();
    const cancel = vi.fn();
    const timer = { unref } as unknown as ReturnType<typeof setInterval>;
    const store = createStore({
      ttlMs: 100,
      now: () => now,
      schedule: (callback) => {
        sweep = callback;
        return timer;
      },
      cancel,
    });

    expect(store.put(snapshot("expiring", 1)).stored).toBe(true);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(store.stats().snapshotCount).toBe(1);

    now = 101;
    sweep?.();

    expect(store.stats()).toEqual(expect.objectContaining({
      snapshotCount: 0,
      retainedRows: 0,
      estimatedBytes: 0,
    }));
    expect(cancel).toHaveBeenCalledWith(timer);
    store.dispose();
  });
});
