import { describe, expect, it, vi } from "vitest";
import { assertReleaseDoesNotExist } from "../scripts/release_existing_release_guard.mjs";

describe("existing GitHub Release guard", () => {
  it("allows a tag only when the Releases API returns not found", async () => {
    const fetchImpl = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => {
      void _input;
      void _init;
      return new Response("", { status: 404 });
    });

    await expect(assertReleaseDoesNotExist({
      repository: "hsnasforum/financeproject",
      tag: "v1.0.4",
      token: "secret-token",
      apiUrl: "https://api.github.com",
      fetchImpl,
    })).resolves.toEqual({ ok: true, exists: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/hsnasforum/financeproject/releases/tags/v1.0.4",
    );
  });

  it("blocks an existing release instead of replacing its assets", async () => {
    const token = "do-not-print-this-token";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));

    const promise = assertReleaseDoesNotExist({
      repository: "hsnasforum/financeproject",
      tag: "v1.0.4",
      token,
      fetchImpl,
    });

    await expect(promise).rejects.toThrowError(/already exists.*automatic overwrite is blocked/);
    await expect(promise).rejects.not.toThrowError(token);
  });

  it("rejects malformed repository, tag, API URL, and unexpected status", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));
    const common = { token: "token", fetchImpl };

    await expect(assertReleaseDoesNotExist({
      ...common,
      repository: "bad repo",
      tag: "v1.0.4",
    })).rejects.toThrowError(/repository is invalid/);
    await expect(assertReleaseDoesNotExist({
      ...common,
      repository: "owner/repo",
      tag: "v$(id)",
    })).rejects.toThrowError(/tag is invalid/);
    await expect(assertReleaseDoesNotExist({
      ...common,
      repository: "owner/repo",
      tag: "v1.0.4",
      apiUrl: "http://api.github.test",
    })).rejects.toThrowError(/HTTPS base URL/);
    await expect(assertReleaseDoesNotExist({
      ...common,
      repository: "owner/repo",
      tag: "v1.0.4",
    })).rejects.toThrowError(/status 403/);
  });
});
