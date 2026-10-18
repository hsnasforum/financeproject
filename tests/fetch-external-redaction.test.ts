import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalApiError, fetchExternal } from "../src/lib/http/fetchExternal";

// Deliberately synthetic credentials, including URL/form encoding boundaries.
const secrets = ["SYNTHETIC_first +/%=雪", "SYNTHETIC_second%2F+", "SYNTHETIC_third&="];
const encodedFirst = encodeURIComponent(secrets[0]).replace(/^S/, "%53");
function expectNoSecrets(value: unknown): void {
  const text = JSON.stringify(value).toLowerCase();
  const leaked = secrets.some((secret) => [
    secret, encodeURIComponent(secret), new URLSearchParams({ v: secret }).toString().slice(2),
  ].some((variant) => text.includes(variant.toLowerCase())));
  expect(leaked || text.includes(encodedFirst.toLowerCase())).toBe(false);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchExternal sensitive query logging", () => {
  it.each(["401", "500", "network", "timeout"] as const)(
    "masks explicit names, encoded names, case variants and duplicates on %s",
    async (failure) => {
      const logs: unknown[][] = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logs.push(args); });
      const url = new URL("https://example.test/fx");
      url.search = "cred%65ntial=" + encodedFirst
        + "&CrEdEnTiAl=" + encodeURIComponent(secrets[1])
        + "&credential=" + encodeURIComponent(secrets[2])
        + "&serviceKey=" + encodeURIComponent(secrets[0])
        + "&auth=" + encodeURIComponent(secrets[1])
        + "&token=" + encodeURIComponent(secrets[2])
        + "&ordinary=visible";
      let calls = 0;
      const requests: string[] = [];
      const inits: Array<RequestInit | undefined> = [];
      vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
        calls++;
        requests.push(input);
        inits.push(init);
        if (failure === "network") {
          throw new TypeError("socket closed: " + input + " echoed " + encodeURIComponent(secrets[0]).toLowerCase()
            + " form " + new URLSearchParams({ v: secrets[1] }).toString().slice(2));
        }
        if (failure === "timeout") {
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("aborted: " + input + " raw " + secrets[2]);
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          });
        }
        return new Response("upstream denied", { status: Number(failure), headers: { "retry-after": "0" } });
      });

      const pending = fetchExternal(url.toString(), {
        sensitiveQueryParams: ["credential"],
        timeoutMs: failure === "timeout" ? 200 : 12_000,
        retries: 2,
        retryOn: [500],
        sourceKey: "synthetic-redaction",
      }).then(() => null, (error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await pending;

      expect(error).toBeInstanceOf(ExternalApiError);
      expect(error).toMatchObject({ timeout: failure === "timeout" });
      expect(calls).toBe(failure === "500" ? 3 : 1);
      expect(logs).toHaveLength(1);
      const logged = logs[0]?.[1] as { url: string; reason?: string };
      const loggedUrl = new URL(logged.url);
      expect(loggedUrl.searchParams.get("ordinary")).toBe("visible");
      for (const [name, value] of loggedUrl.searchParams) {
        if (name !== "ordinary") expect(value).toBe("****");
      }
      if (failure === "network") expect(logged.reason).toContain("socket closed");
      expectNoSecrets(logs);
      expectNoSecrets(error);
      expect(requests.every((request) => request === url.toString())).toBe(true);
      expect(inits.some((init) => Object.hasOwn(init ?? {}, "sensitiveQueryParams"))).toBe(false);
    },
  );

  it("keeps built-in masking complete when duplicate parameters precede another secret", async () => {
    const logs: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logs.push(args); });
    const url = new URL("https://example.test/legacy");
    url.searchParams.append("authkey", secrets[0]);
    url.searchParams.append("authkey", secrets[1]);
    url.searchParams.append("serviceKey", secrets[2]);
    url.searchParams.append("token", secrets[0]);
    url.searchParams.append("ordinary", "visible");
    vi.stubGlobal("fetch", async () => new Response("denied", { status: 401 }));
    await expect(fetchExternal(url.toString())).rejects.toBeInstanceOf(ExternalApiError);
    expect(logs).toHaveLength(1);
    expectNoSecrets(logs);
  });

  it("does not alter successful requests, bodies, or retry behavior", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const url = new URL("https://example.test/success");
    url.searchParams.set("credential", secrets[0]);
    let calls = 0;
    const requests: string[] = [];
    const inits: Array<RequestInit | undefined> = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      requests.push(input);
      inits.push(init);
      calls++;
      return calls === 1
        ? new Response("retry", { status: 500, headers: { "retry-after": "0" } })
        : new Response('{"value":"unchanged"}', { headers: { "content-type": "application/json" } });
    });
    const pending = fetchExternal(url.toString(), { sensitiveQueryParams: ["credential"], retries: 1 })
      .then((value) => value, (error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ ok: true, attempts: 2, body: { value: "unchanged" } });
    expect(calls).toBe(2);
    expect(requests.every((request) => request === url.toString())).toBe(true);
    expect(inits.some((init) => Object.hasOwn(init ?? {}, "sensitiveQueryParams"))).toBe(false);
    expect(logs).not.toHaveBeenCalled();
  });
});
