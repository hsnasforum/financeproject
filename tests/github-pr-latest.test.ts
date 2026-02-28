import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findOpenPrByHead } from "../src/lib/github/pullRequests";

const originalFetch = globalThis.fetch;

function makeResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("github pr latest helper", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns latest open PR url/title/number for head branch", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse([
      {
        number: 100,
        title: "older pr",
        html_url: "https://github.com/example/repo/pull/100",
        created_at: "2026-02-27T00:00:00Z",
      },
      {
        number: 101,
        title: "newer pr",
        html_url: "https://github.com/example/repo/pull/101",
        created_at: "2026-02-27T01:00:00Z",
      },
    ]));

    const pr = await findOpenPrByHead({
      owner: "example",
      repo: "repo",
      head: "bot/rules-tune",
      token: "token",
    });

    expect(pr?.prUrl).toBe("https://github.com/example/repo/pull/101");
    expect(pr?.number).toBe(101);
    expect(pr?.title).toBe("newer pr");
  });

  it("returns null when no open PR exists", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(makeResponse([]));

    const pr = await findOpenPrByHead({
      owner: "example",
      repo: "repo",
      head: "bot/rules-tune",
      token: "token",
    });

    expect(pr).toBeNull();
  });
});
