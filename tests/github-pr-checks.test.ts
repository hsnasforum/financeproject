import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCheckRunsSummary } from "../src/lib/github/checks";

const originalFetch = globalThis.fetch;

function makeResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("github pr checks helper", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns RUNNING when any check is not completed", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse({
      check_runs: [
        {
          status: "queued",
          conclusion: null,
          html_url: "https://github.com/example/repo/actions/runs/100",
        },
        {
          status: "completed",
          conclusion: "success",
          details_url: "https://github.com/example/repo/checks/1",
        },
      ],
    }));

    const summary = await getCheckRunsSummary("example", "repo", "abc123", "token");

    expect(summary.state).toBe("RUNNING");
    expect(summary.total).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it("returns PASSED when all completed checks succeeded", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse({
      check_runs: [
        {
          status: "completed",
          conclusion: "success",
          details_url: "https://github.com/example/repo/checks/11",
        },
        {
          status: "completed",
          conclusion: "success",
          details_url: "https://github.com/example/repo/checks/12",
        },
      ],
    }));

    const summary = await getCheckRunsSummary("example", "repo", "abc123", "token");

    expect(summary.state).toBe("PASSED");
    expect(summary.total).toBe(2);
    expect(summary.completed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.detailsUrl).toBe("https://github.com/example/repo/checks/11");
  });

  it("returns FAILED when completed checks include failures", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse({
      check_runs: [
        {
          status: "completed",
          conclusion: "success",
          details_url: "https://github.com/example/repo/checks/21",
        },
        {
          status: "completed",
          conclusion: "failure",
          details_url: "https://github.com/example/repo/checks/22",
        },
      ],
    }));

    const summary = await getCheckRunsSummary("example", "repo", "abc123", "token");

    expect(summary.state).toBe("FAILED");
    expect(summary.total).toBe(2);
    expect(summary.completed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.detailsUrl).toBe("https://github.com/example/repo/checks/22");
  });
});
