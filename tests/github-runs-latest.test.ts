import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listWorkflowRuns } from "../src/lib/github/actionsRuns";

const originalFetch = globalThis.fetch;

function makeResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("github actions runs helper", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("finds latest matching workflow_dispatch runUrl", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse({
      workflow_runs: [
        {
          id: 10,
          event: "push",
          head_branch: "main",
          html_url: "https://github.com/example/repo/actions/runs/10",
          created_at: "2026-02-27T01:00:00Z",
        },
        {
          id: 11,
          event: "workflow_dispatch",
          head_branch: "main",
          html_url: "https://github.com/example/repo/actions/runs/11",
          created_at: "2026-02-27T02:00:00Z",
        },
      ],
    }));

    const out = await listWorkflowRuns({
      owner: "example",
      repo: "repo",
      workflow: "rules-tune-pr.yml",
      ref: "main",
      token: "token",
    });

    expect(out.runUrl).toBe("https://github.com/example/repo/actions/runs/11");
    expect(out.runs.length).toBe(1);
  });

  it("returns null when no matching run exists", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse({
      workflow_runs: [
        {
          id: 20,
          event: "schedule",
          head_branch: "main",
          html_url: "https://github.com/example/repo/actions/runs/20",
          created_at: "2026-02-27T03:00:00Z",
        },
      ],
    }));

    const out = await listWorkflowRuns({
      owner: "example",
      repo: "repo",
      workflow: "rules-tune-pr.yml",
      ref: "main",
      token: "token",
    });

    expect(out.runUrl).toBeNull();
    expect(out.runs).toEqual([]);
  });

  it("returns null for non-ok github response", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));

    const out = await listWorkflowRuns({
      owner: "example",
      repo: "repo",
      workflow: "rules-tune-pr.yml",
      ref: "main",
      token: "token",
    });

    expect(out.runUrl).toBeNull();
    expect(out.runs).toEqual([]);
  });

  it("applies since filter when selecting run", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse({
      workflow_runs: [
        {
          id: 30,
          event: "workflow_dispatch",
          head_branch: "main",
          html_url: "https://github.com/example/repo/actions/runs/30",
          created_at: "2026-02-27T01:59:59Z",
        },
        {
          id: 31,
          event: "workflow_dispatch",
          head_branch: "main",
          html_url: "https://github.com/example/repo/actions/runs/31",
          created_at: "2026-02-27T02:00:01Z",
        },
      ],
    }));

    const out = await listWorkflowRuns({
      owner: "example",
      repo: "repo",
      workflow: "rules-tune-pr.yml",
      ref: "main",
      token: "token",
      since: "2026-02-27T02:00:00Z",
    });

    expect(out.runUrl).toBe("https://github.com/example/repo/actions/runs/31");
    expect(out.runs.map((row) => row.id)).toEqual([31]);
  });
});
