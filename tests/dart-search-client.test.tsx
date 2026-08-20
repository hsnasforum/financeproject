import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  continueDartBuildAction,
  DartSearchClient,
} from "../src/components/DartSearchClient";
import { createLatestRequestCoordinator } from "../src/lib/browser/latestRequest";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("DartSearchClient initial state", () => {
  it("shows search guidance before the first search", () => {
    const html = renderToStaticMarkup(<DartSearchClient />);

    expect(html).toContain("회사명을 입력하고 검색해 보세요");
    expect(html).toContain("예: 삼성전자, 카카오, 네이버");
    expect(html).toContain("현재 공시 기준으로 회사 개황과 최근 공시 흐름을 이어서 확인할 수 있습니다.");
    expect(html).not.toContain("검색 결과가 없습니다.");
  });
});

describe("DartSearchClient latest action ownership", () => {
  it("does not continue an older build after a newer search supersedes status reload", async () => {
    const coordinator = createLatestRequestCoordinator();
    const statusResponse = deferred();
    const staleSearch = vi.fn(async () => undefined);
    const visibleResults: string[] = [];
    const buildRequest = coordinator.start();

    const buildContinuation = continueDartBuildAction({
      request: buildRequest,
      reloadStatus: async (ownedRequest) => {
        expect(ownedRequest).toBe(buildRequest);
        await statusResponse.promise;
      },
      search: staleSearch,
    });

    const latestSearchRequest = coordinator.start();
    visibleResults.push("latest-search");
    statusResponse.resolve();
    await buildContinuation;

    expect(buildRequest.signal.aborted).toBe(true);
    expect(latestSearchRequest.isCurrent()).toBe(true);
    expect(staleSearch).not.toHaveBeenCalled();
    expect(visibleResults).toEqual(["latest-search"]);
  });

  it("passes one build lease through status reload and follow-up search", async () => {
    const coordinator = createLatestRequestCoordinator();
    const request = coordinator.start();
    const calls: string[] = [];

    await continueDartBuildAction({
      request,
      reloadStatus: async (ownedRequest) => {
        expect(ownedRequest).toBe(request);
        calls.push("status");
      },
      search: async (ownedRequest) => {
        expect(ownedRequest).toBe(request);
        calls.push("search");
      },
    });

    expect(calls).toEqual(["status", "search"]);
  });

  it("uses one coordinator for search, index build, status, and unmount cancellation", () => {
    const source = readFileSync(new URL("../src/components/DartSearchClient.tsx", import.meta.url), "utf8");

    expect(source).toContain("const actionRequestsRef = useRef");
    expect(source).toContain("actionRequestsRef.current?.cancel()");
    expect(source).toContain("signal: request.signal");
    expect(source).toContain("reloadStatus(missing?.statusEndpoint, ownedRequest)");
    expect(source).toContain("search(undefined, ownedRequest)");
    expect(source).toContain('tab !== "monitor"');
    expect(source).toContain("refreshLocalLists, tab, urlMonitorCorpCode");
  });
});
