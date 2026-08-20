import { describe, expect, it } from "vitest";
import { createLatestRequestCoordinator } from "../src/lib/browser/latestRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("latest request coordinator", () => {
  it("invalidates and aborts the previous request when a newer request starts", () => {
    const coordinator = createLatestRequestCoordinator();
    const first = coordinator.start();
    const second = coordinator.start();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(first.finish()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(second.finish()).toBe(true);
    expect(second.isCurrent()).toBe(false);
  });

  it("invalidates the active request on cancellation", () => {
    const coordinator = createLatestRequestCoordinator();
    const active = coordinator.start();

    coordinator.cancel();

    expect(active.signal.aborted).toBe(true);
    expect(active.isCurrent()).toBe(false);
    expect(active.finish()).toBe(false);
  });

  it("promotes only the newest response when an aborted transport still resolves out of order", async () => {
    const coordinator = createLatestRequestCoordinator();
    const firstResponse = deferred<string>();
    const secondResponse = deferred<string>();
    const state = {
      result: "",
      storedResult: "",
      ownerChecks: [] as string[],
      savedHistory: [] as string[],
      autorunSession: "",
      navigation: "",
      exportCandidate: "",
      loading: false,
    };

    async function run(response: Promise<string>) {
      const lease = coordinator.start();
      state.loading = true;
      const value = await response;

      // A fetch mock or transport may resolve even after AbortSignal was ignored.
      if (!lease.isCurrent()) return;
      state.ownerChecks.push(value);
      state.result = value;
      state.storedResult = value;
      state.savedHistory.push(value);
      state.autorunSession = value;
      state.navigation = `/recommend/history?open=${value}`;
      state.exportCandidate = value;
      if (lease.finish()) state.loading = false;
    }

    const firstRun = run(firstResponse.promise);
    const secondRun = run(secondResponse.promise);

    secondResponse.resolve("run-b");
    await secondRun;
    firstResponse.resolve("run-a");
    await firstRun;

    expect(state).toEqual({
      result: "run-b",
      storedResult: "run-b",
      ownerChecks: ["run-b"],
      savedHistory: ["run-b"],
      autorunSession: "run-b",
      navigation: "/recommend/history?open=run-b",
      exportCandidate: "run-b",
      loading: false,
    });
  });
});
