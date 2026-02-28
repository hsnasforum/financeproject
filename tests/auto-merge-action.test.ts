import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextHeadersMock = vi.hoisted(() => ({
  headerStore: new Headers(),
  cookieRows: [] as Array<{ name: string; value: string }>,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => nextHeadersMock.headerStore),
  cookies: vi.fn(async () => ({
    getAll: () => nextHeadersMock.cookieRows,
    get: (name: string) => nextHeadersMock.cookieRows.find((item) => item.name === name),
  })),
}));

import { mergePullRequestAction } from "../src/app/ops/auto-merge/actions";
import { list as listAuditLogs } from "../src/lib/audit/auditLogStore";
import { defaultAutoMergePolicy } from "../src/lib/ops/autoMergePolicy";

const env = process.env as Record<string, string | undefined>;
const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalGithubToken = process.env.GITHUB_TOKEN;
const originalGithubOwner = process.env.GITHUB_OWNER;
const originalGithubRepo = process.env.GITHUB_REPO;
const originalRequiredChecks = process.env.AUTO_MERGE_REQUIRED_CHECKS;
const originalConfirmTemplate = process.env.AUTO_MERGE_CONFIRM_TEMPLATE;
const originalAutoMergeEnabled = process.env.AUTO_MERGE_ENABLED;
const originalAutoMergeRequiredLabel = process.env.AUTO_MERGE_REQUIRED_LABEL;
const originalAutoMergeMinApprovals = process.env.AUTO_MERGE_MIN_APPROVALS;
const originalAutoMergeRequireClean = process.env.AUTO_MERGE_REQUIRE_CLEAN;
const originalAutoMergePolicyPath = process.env.AUTO_MERGE_POLICY_PATH;
const originalAuditPath = process.env.AUDIT_LOG_PATH;
const TEST_AUDIT_PATH = path.join(process.cwd(), "tmp", "audit_log.auto-merge-action.test.json");
const TEST_LOCK_DIR = path.join(process.cwd(), ".data", "locks");
const TEST_POLICY_DIR = path.join(process.cwd(), "tmp", "tests", "auto-merge-action");
const TEST_POLICY_PATH = path.join(TEST_POLICY_DIR, "policy.json");

type OpenPrInput = {
  number?: number;
  state?: string;
  draft?: boolean;
  headSha?: string;
  mergeableState?: string;
  labels?: Array<{ name: string }>;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setupGuardContext(csrf = "csrf-token") {
  nextHeadersMock.headerStore = new Headers({
    host: "localhost:3000",
    origin: "http://localhost:3000",
    referer: "http://localhost:3000/ops/auto-merge",
  });
  nextHeadersMock.cookieRows = [
    { name: "dev_action", value: "1" },
    { name: "dev_csrf", value: csrf },
  ];
}

function openPr(input: OpenPrInput = {}) {
  const number = input.number ?? 700;
  const headSha = input.headSha ?? "abcdef1234567890";
  return {
    number,
    state: input.state ?? "open",
    draft: input.draft ?? false,
    title: "rules tune pr",
    html_url: `https://github.com/example/repo/pull/${number}`,
    mergeable_state: input.mergeableState ?? "clean",
    labels: input.labels ?? [{ name: "automerge" }],
    head: {
      sha: headSha,
      ref: "bot/rules-tune",
    },
    user: {
      login: "bot",
    },
  };
}

function writePolicy(overrides: Partial<ReturnType<typeof defaultAutoMergePolicy>> = {}) {
  const base = defaultAutoMergePolicy();
  const next = {
    ...base,
    enabled: true,
    ...overrides,
    arm: {
      ...base.arm,
      ...(overrides.arm ?? {}),
    },
    updatedBy: "test",
  };
  fs.mkdirSync(TEST_POLICY_DIR, { recursive: true });
  fs.writeFileSync(TEST_POLICY_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

describe("mergePullRequestAction", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.GITHUB_TOKEN = "token";
    env.GITHUB_OWNER = "owner";
    env.GITHUB_REPO = "repo";
    env.AUTO_MERGE_ENABLED = "true";
    env.AUTO_MERGE_REQUIRED_CHECKS = "CI";
    env.AUTO_MERGE_REQUIRED_LABEL = "automerge";
    env.AUTO_MERGE_MIN_APPROVALS = "0";
    env.AUTO_MERGE_REQUIRE_CLEAN = "false";
    env.AUTO_MERGE_POLICY_PATH = TEST_POLICY_PATH;
    delete env.AUTO_MERGE_CONFIRM_TEMPLATE;
    env.AUDIT_LOG_PATH = TEST_AUDIT_PATH;

    if (fs.existsSync(TEST_AUDIT_PATH)) {
      fs.rmSync(TEST_AUDIT_PATH, { force: true });
    }
    if (fs.existsSync(TEST_LOCK_DIR)) {
      for (const file of fs.readdirSync(TEST_LOCK_DIR)) {
        if (file.startsWith("auto-merge-pr-")) {
          fs.rmSync(path.join(TEST_LOCK_DIR, file), { force: true });
        }
      }
    }
    if (fs.existsSync(TEST_POLICY_DIR)) {
      fs.rmSync(TEST_POLICY_DIR, { recursive: true, force: true });
    }
    writePolicy();

    setupGuardContext();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
    if (typeof originalGithubToken === "string") env.GITHUB_TOKEN = originalGithubToken;
    else delete env.GITHUB_TOKEN;
    if (typeof originalGithubOwner === "string") env.GITHUB_OWNER = originalGithubOwner;
    else delete env.GITHUB_OWNER;
    if (typeof originalGithubRepo === "string") env.GITHUB_REPO = originalGithubRepo;
    else delete env.GITHUB_REPO;
    if (typeof originalRequiredChecks === "string") env.AUTO_MERGE_REQUIRED_CHECKS = originalRequiredChecks;
    else delete env.AUTO_MERGE_REQUIRED_CHECKS;
    if (typeof originalConfirmTemplate === "string") env.AUTO_MERGE_CONFIRM_TEMPLATE = originalConfirmTemplate;
    else delete env.AUTO_MERGE_CONFIRM_TEMPLATE;
    if (typeof originalAutoMergeEnabled === "string") env.AUTO_MERGE_ENABLED = originalAutoMergeEnabled;
    else delete env.AUTO_MERGE_ENABLED;
    if (typeof originalAutoMergeRequiredLabel === "string") env.AUTO_MERGE_REQUIRED_LABEL = originalAutoMergeRequiredLabel;
    else delete env.AUTO_MERGE_REQUIRED_LABEL;
    if (typeof originalAutoMergeMinApprovals === "string") env.AUTO_MERGE_MIN_APPROVALS = originalAutoMergeMinApprovals;
    else delete env.AUTO_MERGE_MIN_APPROVALS;
    if (typeof originalAutoMergeRequireClean === "string") env.AUTO_MERGE_REQUIRE_CLEAN = originalAutoMergeRequireClean;
    else delete env.AUTO_MERGE_REQUIRE_CLEAN;
    if (typeof originalAutoMergePolicyPath === "string") env.AUTO_MERGE_POLICY_PATH = originalAutoMergePolicyPath;
    else delete env.AUTO_MERGE_POLICY_PATH;
    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;

    globalThis.fetch = originalFetch;
    if (fs.existsSync(TEST_AUDIT_PATH)) {
      fs.rmSync(TEST_AUDIT_PATH, { force: true });
    }
    if (fs.existsSync(TEST_LOCK_DIR)) {
      for (const file of fs.readdirSync(TEST_LOCK_DIR)) {
        if (file.startsWith("auto-merge-pr-")) {
          fs.rmSync(path.join(TEST_LOCK_DIR, file), { force: true });
        }
      }
    }
    if (fs.existsSync(TEST_POLICY_DIR)) {
      fs.rmSync(TEST_POLICY_DIR, { recursive: true, force: true });
    }
  });

  it("rejects draft PR", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr({ number: 701, draft: true })));

    const result = await mergePullRequestAction({
      prNumber: 701,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 701 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("Draft");
  });

  it("rejects PR when state is not open", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr({ number: 702, state: "closed" })));

    const result = await mergePullRequestAction({
      prNumber: 702,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 702 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("open");
  });

  it("rejects when expected head sha mismatches", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr({ number: 703, headSha: "abcdef1234567890" })));

    const result = await mergePullRequestAction({
      prNumber: 703,
      expectedHeadSha: "9999999123456789",
      confirmText: "MERGE 703 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("SHA");
  });

  it("rejects when confirm text mismatches", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 704 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 704,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 704 WRONG",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("확인 문구");
  });

  it("rejects when required check is missing", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 705 })))
      .mockResolvedValueOnce(jsonResponse({ check_runs: [] }));

    const result = await mergePullRequestAction({
      prNumber: 705,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 705 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("필수 체크");
  });

  it("rejects when required check is pending", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 706 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "in_progress",
            conclusion: null,
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 706,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 706 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("pending");
  });

  it("rejects when required check has failed conclusion", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 707 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "failure",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 707,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 707 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("필수 체크");
  });

  it("merges successfully, calls merge endpoint once, and writes audit log", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 708 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        merged: true,
        sha: "mergecommitsha123",
        message: "Pull Request successfully merged",
      }));

    const result = await mergePullRequestAction({
      prNumber: 708,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 708 abcdef1",
    });

    expect(result.ok).toBe(true);
    expect(result.merged).toBe(true);
    expect(result.mergeCommitSha).toBe("mergecommitsha123");

    const mergeCalls = fetchMock.mock.calls.filter(([url, init]) => {
      const endpoint = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      return endpoint.includes("/pulls/708/merge") && method === "PUT";
    });
    expect(mergeCalls).toHaveLength(1);

    const auditRows = listAuditLogs(10);
    expect(auditRows[0]?.event).toBe("AUTO_MERGE");
    expect(auditRows[0]?.summary).toContain("SUCCESS");
    expect(auditRows[0]?.details).toMatchObject({
      prNumber: 708,
      result: "SUCCESS",
    });
  });

  it("rejects when auto merge is disabled", async () => {
    env.AUTO_MERGE_ENABLED = "false";

    const result = await mergePullRequestAction({
      prNumber: 709,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 709 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("AUTO_MERGE_DISABLED");

    const auditRows = listAuditLogs(5);
    expect(auditRows[0]?.details).toMatchObject({
      reason: "DISABLED",
      result: "REJECTED",
    });
  });

  it("rejects when required label is missing", async () => {
    writePolicy({ requiredLabel: "safe-merge" });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...openPr({ number: 710 }),
      labels: [{ name: "needs-review" }],
    }));

    const result = await mergePullRequestAction({
      prNumber: 710,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 710 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("safe-merge");
    expect(result.message).toContain("라벨");

    const auditRows = listAuditLogs(5);
    expect(auditRows[0]?.details).toMatchObject({
      reason: "LABEL_MISSING",
      result: "REJECTED",
    });
  });

  it("rejects when merge lock already exists", async () => {
    const lockPath = path.join(TEST_LOCK_DIR, "auto-merge-pr-711.lock");
    fs.mkdirSync(TEST_LOCK_DIR, { recursive: true });
    fs.writeFileSync(lockPath, "busy", "utf-8");

    const result = await mergePullRequestAction({
      prNumber: 711,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 711 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("MERGE_IN_PROGRESS");

    const auditRows = listAuditLogs(5);
    expect(auditRows[0]?.details).toMatchObject({
      reason: "IN_PROGRESS",
      result: "REJECTED",
    });
  });

  it("releases lock file after successful merge", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 712 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        merged: true,
        sha: "mergecommitsha712",
      }));

    const result = await mergePullRequestAction({
      prNumber: 712,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 712 abcdef1",
    });

    expect(result.ok).toBe(true);
    const lockPath = path.join(TEST_LOCK_DIR, "auto-merge-pr-712.lock");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("releases lock file after failed merge attempt", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 713 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 713,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 713 WRONG",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("확인 문구");
    const lockPath = path.join(TEST_LOCK_DIR, "auto-merge-pr-713.lock");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("rejects when approvals are missing", async () => {
    writePolicy({ minApprovals: 1 });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 714 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse([]));

    const result = await mergePullRequestAction({
      prNumber: 714,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 714 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("approvals 0/1");

    const auditRows = listAuditLogs(5);
    expect(auditRows[0]?.details).toMatchObject({
      reason: "APPROVALS_MISSING",
      result: "REJECTED",
    });
  });

  it("passes approvals gate when latest review state is approved", async () => {
    writePolicy({ minApprovals: 1 });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 715 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse([
        { user: { login: "alice" }, state: "APPROVED" },
        { user: { login: "alice" }, state: "DISMISSED" },
        { user: { login: "alice" }, state: "APPROVED" },
      ]))
      .mockResolvedValueOnce(jsonResponse({
        merged: true,
        sha: "mergecommitsha715",
      }));

    const result = await mergePullRequestAction({
      prNumber: 715,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 715 abcdef1",
    });

    expect(result.ok).toBe(true);
    expect(result.merged).toBe(true);
    expect(result.mergeCommitSha).toBe("mergecommitsha715");
  });

  it("rejects when require clean is enabled and mergeable_state is dirty", async () => {
    writePolicy({ requireClean: true });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 716, mergeableState: "dirty" })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 716,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 716 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("merge conflict");
    const auditRows = listAuditLogs(5);
    expect(auditRows[0]?.details).toMatchObject({
      reason: "MERGE_CONFLICT",
      result: "REJECTED",
    });
  });

  it("rejects when mergeable_state remains unknown after retries", async () => {
    writePolicy({ requireClean: true });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 717, mergeableState: "unknown" })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 717, mergeableState: "unknown" })))
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 717, mergeableState: "unknown" })))
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 717, mergeableState: "unknown" })));

    const result = await mergePullRequestAction({
      prNumber: 717,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 717 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("mergeable_state");
    const auditRows = listAuditLogs(5);
    expect(auditRows[0]?.details).toMatchObject({
      reason: "UNKNOWN_MERGEABLE",
      result: "REJECTED",
    });
  });

  it("rejects when policy required checks are not all satisfied", async () => {
    writePolicy({ requiredChecks: ["CI", "lint"] });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 718 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 718,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 718 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.message).toContain("lint: missing");
  });

  it("uses policy mergeMethod when calling GitHub merge API", async () => {
    writePolicy({ mergeMethod: "rebase" });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr({ number: 719 })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        merged: true,
        sha: "mergecommitsha719",
      }));

    const result = await mergePullRequestAction({
      prNumber: 719,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 719 abcdef1",
    });

    expect(result.ok).toBe(true);
    expect(result.merged).toBe(true);

    const mergeCall = fetchMock.mock.calls.find(([url, init]) => {
      const endpoint = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      return endpoint.includes("/pulls/719/merge") && method === "PUT";
    });
    expect(mergeCall).toBeDefined();
    const body = String((mergeCall?.[1] as RequestInit | undefined)?.body ?? "");
    expect(body).toContain("\"merge_method\":\"rebase\"");
  });
});
