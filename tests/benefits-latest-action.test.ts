import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runBenefitsRefreshAction } from "../src/components/BenefitsClient";
import { createLatestRequestCoordinator } from "../src/lib/browser/latestRequest";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("BenefitsClient latest action ownership", () => {
  it("does not let an older refresh trigger a search after a newer search starts", async () => {
    const coordinator = createLatestRequestCoordinator();
    const refreshResponse = deferred();
    const staleSearch = vi.fn(async () => undefined);
    const visibleResults: string[] = [];
    const refreshRequest = coordinator.start();

    const refreshTask = runBenefitsRefreshAction({
      request: refreshRequest,
      refresh: async (signal) => {
        expect(signal).toBe(refreshRequest.signal);
        await refreshResponse.promise;
      },
      search: staleSearch,
    });

    const latestSearchRequest = coordinator.start();
    visibleResults.push("latest-search");
    refreshResponse.resolve();
    await refreshTask;

    expect(refreshRequest.signal.aborted).toBe(true);
    expect(latestSearchRequest.isCurrent()).toBe(true);
    expect(staleSearch).not.toHaveBeenCalled();
    expect(visibleResults).toEqual(["latest-search"]);
  });

  it("passes the refresh lease to its follow-up search while it remains current", async () => {
    const coordinator = createLatestRequestCoordinator();
    const request = coordinator.start();
    const search = vi.fn(async () => undefined);

    await runBenefitsRefreshAction({
      request,
      refresh: async () => undefined,
      search,
    });

    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith(request);
  });

  it("wires snapshot refresh and result search through the same request lease", () => {
    const source = readFileSync(new URL("../src/components/BenefitsClient.tsx", import.meta.url), "utf8");

    expect(source).toContain('fetch("/api/dev/benefits/snapshot/refresh", { method: "POST", signal })');
    expect(source).toContain("await runBenefitsRefreshAction({");
    expect(source).toContain("ownedRequest,");
    expect(source).toContain("searchRequestsRef.current?.cancel()");
  });
});
