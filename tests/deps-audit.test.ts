import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyDependencyAuditExceptions,
  buildBulkAdvisoryPayload,
  collectBulkAdvisories,
  collectProductionPackageNames,
  parseDependencyAuditExceptions,
  readAdvisoryId,
  runDependencyAudit,
} from "../scripts/deps_audit.mjs";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createAuditFixture(prefix: string) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(cwd);
  await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), `
lockfileVersion: '9.0'
packages:
  'plain@1.0.0': {}
`, "utf8");
  return cwd;
}

function cleanAuditResponse() {
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

function createNetworkError(code: string) {
  const error = new TypeError("fetch failed") as TypeError & { cause?: unknown };
  error.cause = Object.assign(new Error("socket failure"), { code });
  return error;
}

function createImmediateTimeoutSignal() {
  const controller = new AbortController();
  queueMicrotask(() => controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
  return controller.signal;
}

function rejectWhenAborted(signal: AbortSignal, rejectionName: "AbortError" | "TimeoutError" = "TimeoutError") {
  return new Promise<Response>((_resolve, reject) => {
    const rejectTimeout = () => {
      reject(rejectionName === "AbortError"
        ? new DOMException("The operation was aborted", "AbortError")
        : signal.reason);
    };
    if (signal.aborted) {
      rejectTimeout();
      return;
    }
    signal.addEventListener("abort", rejectTimeout, { once: true });
  });
}

describe("dependency bulk advisory audit", () => {
  it("builds a deduplicated payload from pnpm lockfile package keys", () => {
    const payload = buildBulkAdvisoryPayload(`
lockfileVersion: '9.0'
packages:
  '@scope/pkg@2.0.0': {}
  'plain@1.0.0': {}
  'plain@1.0.0(peer@3.0.0)': {}
`);

    expect(payload).toEqual({
      "@scope/pkg": ["2.0.0"],
      plain: ["1.0.0"],
    });
  });

  it("fails closed on unsupported lockfile versions and package keys", () => {
    expect(() => buildBulkAdvisoryPayload(`
lockfileVersion: '10.0'
packages:
  'plain@1.0.0': {}
`)).toThrow(/unsupported pnpm lockfileVersion/);

    expect(() => buildBulkAdvisoryPayload(`
lockfileVersion: '9.0'
packages:
  malformed: {}
`)).toThrow(/unsupported pnpm package key/);
  });

  it("normalizes and sorts advisories by severity", () => {
    expect(collectBulkAdvisories({
      beta: [{ severity: "low", title: "low issue", vulnerable_versions: "<2" }],
      alpha: [{ severity: "critical", title: "critical issue", vulnerable_versions: "1.x", url: "https://example.test/a" }],
    })).toEqual([
      {
        packageName: "alpha",
        severity: "critical",
        title: "critical issue",
        vulnerableVersions: "1.x",
        url: "https://example.test/a",
      },
      {
        packageName: "beta",
        severity: "low",
        title: "low issue",
        vulnerableVersions: "<2",
        url: "",
      },
    ]);
  });

  it("fails closed on malformed responses and reports a clean live-shaped response", async () => {
    expect(() => collectBulkAdvisories({ broken: {} })).toThrow(/must be an array/);

    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "finance-deps-audit-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), `
lockfileVersion: '9.0'
packages:
  'plain@1.0.0': {}
`, "utf8");

    const requests: Array<{ url: string; body: string }> = [];
    const result = await runDependencyAudit({
      cwd,
      fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
        requests.push({ url: String(url), body: String(init?.body) });
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    expect(result).toEqual({ ok: true, packageCount: 1, versionCount: 1, advisories: [] });
    expect(requests).toEqual([{
      url: "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
      body: JSON.stringify({ plain: ["1.0.0"] }),
    }]);
  });

  it("fails closed on registry errors and invalid JSON", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "finance-deps-audit-errors-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), `
lockfileVersion: '9.0'
packages:
  'plain@1.0.0': {}
`, "utf8");

    await expect(runDependencyAudit({
      cwd,
      fetchImpl: async () => new Response("retired", { status: 410 }),
    })).rejects.toThrow(/status=410/);

    await expect(runDependencyAudit({
      cwd,
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    })).rejects.toThrow(/not valid JSON/);
  });

  it("returns a failing result when the registry reports an advisory", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "finance-deps-audit-advisory-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "pnpm-lock.yaml"), `
lockfileVersion: '9.0'
packages:
  'plain@1.0.0': {}
`, "utf8");

    const result = await runDependencyAudit({
      cwd,
      fetchImpl: async () => new Response(JSON.stringify({
        plain: [{ severity: "high", title: "unsafe", vulnerable_versions: "1.x" }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });

    expect(result.ok).toBe(false);
    expect(result.advisories).toHaveLength(1);
  });

  it("retries a timed-out attempt with a fresh signal and identical request body", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-timeout-success-");
    const requests: Array<{ body: string; signal: AbortSignal }> = [];
    const delays: number[] = [];
    const logs: string[] = [];

    const result = await runDependencyAudit({
      cwd,
      maxAttempts: 2,
      attemptTimeoutMs: 30_000,
      retryDelaysMs: [1_000],
      timeoutSignalFactory: () => createImmediateTimeoutSignal(),
      logger: (message: string) => logs.push(message),
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) throw new Error("missing request signal");
        requests.push({ body: String(init?.body), signal });
        if (requests.length === 1) return rejectWhenAborted(signal, "AbortError");
        return cleanAuditResponse();
      },
    });

    expect(result).toEqual({ ok: true, packageCount: 1, versionCount: 1, advisories: [] });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(requests[0]?.signal).not.toBe(requests[1]?.signal);
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(delays).toEqual([1_000]);
    expect(logs).toContainEqual(expect.stringMatching(/RETRY .*phase=fetch reason=timeout .*nextDelayMs=1000/));
  });

  it("retries when a successful response body times out and then succeeds", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-body-timeout-success-");
    const requests: Array<{ body: string; signal: AbortSignal }> = [];
    const delays: number[] = [];
    const logs: string[] = [];
    let bodyParses = 0;

    const result = await runDependencyAudit({
      cwd,
      maxAttempts: 2,
      attemptTimeoutMs: 30_000,
      retryDelaysMs: [1_000],
      timeoutSignalFactory: () => createImmediateTimeoutSignal(),
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      logger: (message: string) => logs.push(message),
      fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) throw new Error("missing request signal");
        requests.push({ body: String(init?.body), signal });
        return {
          ok: true,
          status: 200,
          json: async () => {
            bodyParses += 1;
            if (bodyParses === 1) return rejectWhenAborted(signal);
            return {};
          },
        } as Response;
      },
    });

    expect(result).toEqual({ ok: true, packageCount: 1, versionCount: 1, advisories: [] });
    expect(requests).toHaveLength(2);
    expect(bodyParses).toBe(2);
    expect(delays).toEqual([1_000]);
    expect(requests[0]?.signal).not.toBe(requests[1]?.signal);
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(logs).toContainEqual(expect.stringMatching(/RETRY .*phase=response_body reason=timeout .*nextDelayMs=1000/));
  });

  it("retries a successful response body network failure and then succeeds", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-body-network-success-");
    const delays: number[] = [];
    const logs: string[] = [];
    let fetchCalls = 0;
    let bodyParses = 0;

    const result = await runDependencyAudit({
      cwd,
      maxAttempts: 2,
      retryDelaysMs: [1_000],
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      logger: (message: string) => logs.push(message),
      fetchImpl: async () => {
        fetchCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => {
            bodyParses += 1;
            if (bodyParses === 1) {
              const error = new TypeError("terminated") as TypeError & { cause?: unknown };
              error.cause = Object.assign(new Error("socket failure"), { code: "UND_ERR_SOCKET" });
              throw error;
            }
            return {};
          },
        } as Response;
      },
    });

    expect(result).toEqual({ ok: true, packageCount: 1, versionCount: 1, advisories: [] });
    expect(fetchCalls).toBe(2);
    expect(bodyParses).toBe(2);
    expect(delays).toEqual([1_000]);
    expect(logs).toContainEqual(expect.stringMatching(/RETRY .*phase=response_body reason=network .*nextDelayMs=1000/));
  });

  it("stops after three successful-response body timeouts", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-body-timeout-exhausted-");
    const delays: number[] = [];
    const logs: string[] = [];
    let fetchCalls = 0;
    let bodyParses = 0;

    await expect(runDependencyAudit({
      cwd,
      maxAttempts: 3,
      retryDelaysMs: [1_000, 2_000],
      timeoutSignalFactory: () => createImmediateTimeoutSignal(),
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      logger: (message: string) => logs.push(message),
      fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
        fetchCalls += 1;
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) throw new Error("missing request signal");
        return {
          ok: true,
          status: 200,
          json: async () => {
            bodyParses += 1;
            return rejectWhenAborted(signal);
          },
        } as Response;
      },
    })).rejects.toThrow(/attempts=3 lastPhase=response_body lastReason=timeout.*response body timed out/);

    expect(fetchCalls).toBe(3);
    expect(bodyParses).toBe(3);
    expect(delays).toEqual([1_000, 2_000]);
    expect(logs).toContainEqual(expect.stringMatching(/STOP attempt=3\/3 phase=response_body reason=timeout .*retrying=false/));
  });

  it("retries a recognized network transport error and then succeeds", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-network-success-");
    const delays: number[] = [];
    let fetchCalls = 0;

    const result = await runDependencyAudit({
      cwd,
      maxAttempts: 2,
      retryDelaysMs: [1_000],
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) throw createNetworkError("ECONNRESET");
        return cleanAuditResponse();
      },
    });

    expect(result.ok).toBe(true);
    expect(fetchCalls).toBe(2);
    expect(delays).toEqual([1_000]);
  });

  it("retries HTTP 503 and then succeeds", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-503-success-");
    const delays: number[] = [];
    const logs: string[] = [];
    let fetchCalls = 0;

    const result = await runDependencyAudit({
      cwd,
      maxAttempts: 2,
      retryDelaysMs: [1_000],
      logger: (message: string) => logs.push(message),
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return fetchCalls === 1
          ? new Response("temporarily unavailable", { status: 503 })
          : cleanAuditResponse();
      },
    });

    expect(result.ok).toBe(true);
    expect(fetchCalls).toBe(2);
    expect(delays).toEqual([1_000]);
    expect(logs).toContainEqual(expect.stringMatching(/RETRY .*phase=http_status reason=http_503 .*nextDelayMs=1000/));
  });

  it("stops after three timeout attempts with bounded delays", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-timeout-exhausted-");
    const delays: number[] = [];
    const timeouts: number[] = [];
    const logs: string[] = [];
    let fetchCalls = 0;

    await expect(runDependencyAudit({
      cwd,
      timeoutSignalFactory: (timeoutMs: number) => {
        timeouts.push(timeoutMs);
        return createImmediateTimeoutSignal();
      },
      logger: (message: string) => logs.push(message),
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
        fetchCalls += 1;
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) throw new Error("missing request signal");
        return rejectWhenAborted(signal);
      },
    })).rejects.toThrow(/attempts=3 lastPhase=fetch lastReason=timeout/);

    expect(fetchCalls).toBe(3);
    expect(delays).toEqual([1_000, 2_000]);
    expect(timeouts).toEqual([90_000, 90_000, 90_000]);
    expect(logs).toContainEqual(expect.stringMatching(/STOP attempt=3\/3 phase=fetch reason=timeout .*retrying=false/));
  });

  it("stops after three retryable HTTP 500 responses", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-500-exhausted-");
    const delays: number[] = [];
    let fetchCalls = 0;

    await expect(runDependencyAudit({
      cwd,
      maxAttempts: 3,
      retryDelaysMs: [1_000, 2_000],
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("server error", { status: 500 });
      },
    })).rejects.toThrow(/attempts=3 lastPhase=http_status lastReason=http_500.*status=500/);

    expect(fetchCalls).toBe(3);
    expect(delays).toEqual([1_000, 2_000]);
  });

  it.each([400, 403, 410, 429])("fails fast for HTTP %s", async (status) => {
    const cwd = await createAuditFixture(`finance-deps-audit-${status}-`);
    const delays: number[] = [];
    let fetchCalls = 0;

    await expect(runDependencyAudit({
      cwd,
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("request rejected", { status });
      },
    })).rejects.toThrow(new RegExp(`attempts=1 lastPhase=http_status lastReason=http_${status}.*status=${status}`));

    expect(fetchCalls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("fails fast on malformed JSON without retrying", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-invalid-json-");
    const delays: number[] = [];
    const logs: string[] = [];
    let fetchCalls = 0;

    await expect(runDependencyAudit({
      cwd,
      logger: (message: string) => logs.push(message),
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("not-json", { status: 200 });
      },
    })).rejects.toThrow(/attempts=1 lastPhase=response_parse lastReason=invalid_json.*not valid JSON/);

    expect(fetchCalls).toBe(1);
    expect(delays).toEqual([]);
    expect(logs).toContainEqual(expect.stringMatching(/STOP attempt=1\/3 phase=response_parse reason=invalid_json .*retrying=false/));
  });

  it("returns an advisory result without retrying or losing advisory details", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-advisory-fast-");
    const delays: number[] = [];
    let fetchCalls = 0;

    const result = await runDependencyAudit({
      cwd,
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({
          plain: [{
            severity: "high",
            title: "unsafe dependency",
            vulnerable_versions: "1.x",
            url: "https://example.test/advisory",
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    expect(result).toMatchObject({
      ok: false,
      advisories: [{
        packageName: "plain",
        severity: "high",
        title: "unsafe dependency",
        vulnerableVersions: "1.x",
        url: "https://example.test/advisory",
      }],
    });
    expect(fetchCalls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("fails fast on an invalid bulk response contract", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-invalid-contract-");
    const delays: number[] = [];
    const logs: string[] = [];
    let fetchCalls = 0;

    await expect(runDependencyAudit({
      cwd,
      logger: (message: string) => logs.push(message),
      sleepImpl: async (delay: number) => {
        delays.push(delay);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ plain: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    })).rejects.toThrow(/attempts=1 lastPhase=response_parse lastReason=invalid_response.*must be an array/);

    expect(fetchCalls).toBe(1);
    expect(delays).toEqual([]);
    expect(logs).toContainEqual(expect.stringMatching(/STOP attempt=1\/3 phase=response_parse reason=invalid_response .*retrying=false/));
  });

  it("bounds a synchronous recognized network throw but fails fast on programmer errors", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-sync-throw-");
    const networkDelays: number[] = [];
    let networkFetchCalls = 0;

    const result = await runDependencyAudit({
      cwd,
      maxAttempts: 2,
      retryDelaysMs: [1_000],
      sleepImpl: async (delay: number) => {
        networkDelays.push(delay);
      },
      fetchImpl: () => {
        networkFetchCalls += 1;
        if (networkFetchCalls === 1) throw createNetworkError("EAI_AGAIN");
        return Promise.resolve(cleanAuditResponse());
      },
    });

    expect(result.ok).toBe(true);
    expect(networkFetchCalls).toBe(2);
    expect(networkDelays).toEqual([1_000]);

    const programmerDelays: number[] = [];
    let programmerFetchCalls = 0;
    await expect(runDependencyAudit({
      cwd,
      sleepImpl: async (delay: number) => {
        programmerDelays.push(delay);
      },
      fetchImpl: () => {
        programmerFetchCalls += 1;
        throw new TypeError("programmer failure");
      },
    })).rejects.toThrow(/attempts=1 lastPhase=fetch lastReason=request_error.*programmer failure/);

    expect(programmerFetchCalls).toBe(1);
    expect(programmerDelays).toEqual([]);
  });

  it("logs retry classification and final attempts without request or registry secrets", async () => {
    const cwd = await createAuditFixture("finance-deps-audit-logging-");
    const logs: string[] = [];
    let fetchCalls = 0;

    await runDependencyAudit({
      cwd,
      env: { NPM_CONFIG_REGISTRY: "https://registry.npmjs.org?token=secret-value" },
      maxAttempts: 2,
      retryDelaysMs: [1_000],
      sleepImpl: async () => {},
      logger: (message: string) => logs.push(message),
      fetchImpl: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) throw createNetworkError("UND_ERR_SOCKET");
        return cleanAuditResponse();
      },
    });

    expect(logs[0]).toBe("[deps:audit] attempt=1/2");
    expect(logs[1]).toMatch(
      /^\[deps:audit\] RETRY attempt=1\/2 phase=fetch reason=network elapsedMs=\d+ retrying=true nextDelayMs=1000$/,
    );
    expect(logs[2]).toBe("[deps:audit] attempt=2/2");
    expect(logs[3]).toBe("[deps:audit] checked packages=1 versions=1 advisories=0 attempts=2");
    expect(logs.join("\n")).not.toContain("secret-value");
    expect(logs.join("\n")).not.toContain(JSON.stringify({ plain: ["1.0.0"] }));
  });
});

describe("dependency audit exceptions", () => {
  const now = new Date("2026-10-14T00:00:00+09:00");
  const bracesAdvisory = {
    packageName: "braces",
    severity: "high",
    title: "braces vulnerable to stack-exhaustion denial of service",
    vulnerableVersions: "<=3.0.3",
    url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  };
  const otherAdvisory = {
    packageName: "runtime-lib",
    severity: "moderate",
    title: "runtime issue",
    vulnerableVersions: "<2.0.0",
    url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  };

  function exceptionEntry(overrides: Record<string, unknown> = {}) {
    return {
      advisory: "GHSA-vfj7-8cjw-p6xm",
      package: "braces",
      scope: "dev",
      reason: "no patched release; lint-only devDependency",
      mitigation: "remove when a patched release is available",
      expiresAt: "2026-11-14T00:00:00+09:00",
      ...overrides,
    };
  }

  function exceptionsSource(...entries: Record<string, unknown>[]) {
    return JSON.stringify({ schemaVersion: 1, exceptions: entries });
  }

  const lockfile = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      app-runtime:
        specifier: ^1.0.0
        version: 1.0.0(peer@1.0.0)
    devDependencies:
      lint-plugin:
        specifier: ^1.0.0
        version: 1.0.0
packages:
  app-runtime@1.0.0: {}
  runtime-lib@1.0.0: {}
  peer@1.0.0: {}
  lint-plugin@1.0.0: {}
  braces@3.0.3: {}
snapshots:
  app-runtime@1.0.0(peer@1.0.0):
    dependencies:
      runtime-lib: 1.0.0
      peer: 1.0.0
  runtime-lib@1.0.0: {}
  peer@1.0.0: {}
  lint-plugin@1.0.0:
    dependencies:
      braces: 3.0.3
  braces@3.0.3: {}
`;

  it("reads the GHSA identifier from the advisory URL", () => {
    expect(readAdvisoryId(bracesAdvisory)).toBe("GHSA-vfj7-8cjw-p6xm");
    expect(readAdvisoryId({ url: "https://example.invalid/advisory/1" })).toBe("");
  });

  it("accepts a complete dev-scoped exception that has not expired", () => {
    const exceptions = parseDependencyAuditExceptions(exceptionsSource(exceptionEntry()), now);
    expect([...exceptions.values()]).toEqual([expect.objectContaining({
      advisory: "GHSA-vfj7-8cjw-p6xm",
      packageName: "braces",
      scope: "dev",
      expiresAt: "2026-11-14T00:00:00+09:00",
    })]);
  });

  it("rejects incomplete, non-dev, expired, too long, and duplicate exceptions", () => {
    expect(() => parseDependencyAuditExceptions("{", now)).toThrow("valid JSON");
    expect(() => parseDependencyAuditExceptions(JSON.stringify({ exceptions: [] }), now)).toThrow("schemaVersion=1");
    expect(() => parseDependencyAuditExceptions(exceptionsSource(exceptionEntry({ reason: " " })), now))
      .toThrow("invalid dependency audit exception entry: GHSA-vfj7-8cjw-p6xm");
    expect(() => parseDependencyAuditExceptions(exceptionsSource(exceptionEntry({ advisory: "CVE-2026-1" })), now))
      .toThrow("invalid dependency audit exception entry");
    expect(() => parseDependencyAuditExceptions(exceptionsSource(exceptionEntry({ scope: "runtime" })), now))
      .toThrow("invalid dependency audit exception entry");
    expect(() => parseDependencyAuditExceptions(exceptionsSource(exceptionEntry()), new Date("2026-11-14T00:00:00+09:00")))
      .toThrow("expired dependency audit exception: GHSA-vfj7-8cjw-p6xm braces");
    expect(() => parseDependencyAuditExceptions(exceptionsSource(exceptionEntry({ expiresAt: "2027-03-01T00:00:00+09:00" })), now))
      .toThrow("must expire within 90 days");
    expect(() => parseDependencyAuditExceptions(exceptionsSource(exceptionEntry(), exceptionEntry()), now))
      .toThrow("duplicate dependency audit exception");
  });

  it("collects only packages reachable from runtime dependencies", () => {
    const names = collectProductionPackageNames(lockfile);
    expect([...names].sort()).toEqual(["app-runtime", "peer", "runtime-lib"]);
    const withoutRuntimeSnapshot = lockfile.replace("      peer: 1.0.0\n  runtime-lib@1.0.0: {}\n", "      peer: 1.0.0\n");
    expect(withoutRuntimeSnapshot).not.toBe(lockfile);
    expect(() => collectProductionPackageNames(withoutRuntimeSnapshot))
      .toThrow("snapshot is missing for runtime dependency runtime-lib@1.0.0");
  });

  it("moves only the matching dev-only advisory out of the blocking list", () => {
    const exceptions = parseDependencyAuditExceptions(exceptionsSource(exceptionEntry()), now);
    const result = applyDependencyAuditExceptions({
      advisories: [bracesAdvisory, otherAdvisory],
      exceptions,
      productionPackageNames: collectProductionPackageNames(lockfile),
    });

    expect(result.blocking).toEqual([otherAdvisory]);
    expect(result.excepted).toEqual([expect.objectContaining({
      packageName: "braces",
      exception: expect.objectContaining({ advisory: "GHSA-vfj7-8cjw-p6xm" }),
    })]);
  });

  it("fails when a dev exception covers a runtime package or is no longer reported", () => {
    const exceptions = parseDependencyAuditExceptions(exceptionsSource(exceptionEntry()), now);
    expect(() => applyDependencyAuditExceptions({
      advisories: [bracesAdvisory],
      exceptions,
      productionPackageNames: new Set(["braces"]),
    })).toThrow("scoped to dev, but the package is reachable from runtime dependencies");
    expect(() => applyDependencyAuditExceptions({
      advisories: [otherAdvisory],
      exceptions,
      productionPackageNames: new Set(),
    })).toThrow("unused dependency audit exceptions: GHSA-vfj7-8cjw-p6xm braces");
  });

  it("wires the package script to the single exceptions file", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["deps:audit"]).toBe("node scripts/deps_audit.mjs --exceptions=config/dependency-audit-exceptions.json");
  });
});
