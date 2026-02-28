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
  })),
}));

import { mergePullRequestAction } from "../src/app/ops/auto-merge/actions";
import { list as listAudit } from "../src/lib/audit/auditLogStore";
import { defaultAutoMergePolicy } from "../src/lib/ops/autoMergePolicy";

const env = process.env as Record<string, string | undefined>;
const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalGithubToken = process.env.GITHUB_TOKEN;
const originalGithubOwner = process.env.GITHUB_OWNER;
const originalGithubRepo = process.env.GITHUB_REPO;
const originalRequiredChecks = process.env.AUTO_MERGE_REQUIRED_CHECKS;
const originalTemplate = process.env.AUTO_MERGE_CONFIRM_TEMPLATE;
const originalAutoMergeEnabled = process.env.AUTO_MERGE_ENABLED;
const originalAutoMergeRequiredLabel = process.env.AUTO_MERGE_REQUIRED_LABEL;
const originalPolicyPath = process.env.AUTO_MERGE_POLICY_PATH;
const originalAuditPath = process.env.AUDIT_LOG_PATH;
const TEST_AUDIT_PATH = path.join(process.cwd(), "tmp", "audit_log.auto-merge.test.json");
const TEST_POLICY_DIR = path.join(process.cwd(), "tmp", "tests", "auto-merge");
const TEST_POLICY_PATH = path.join(TEST_POLICY_DIR, "policy.json");

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setGuardContext(csrf = "csrf-token") {
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

function openPr(number = 120, headSha = "abcdef1234567890", overrides?: Record<string, unknown>) {
  return {
    number,
    state: "open",
    draft: false,
    title: "rules tune pr",
    html_url: `https://github.com/example/repo/pull/${number}`,
    labels: [{ name: "automerge" }],
    head: {
      sha: headSha,
      ref: "bot/rules-tune",
    },
    user: { login: "bot" },
    ...overrides,
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

describe("auto merge action", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.GITHUB_TOKEN = "token";
    env.GITHUB_OWNER = "owner";
    env.GITHUB_REPO = "repo";
    env.AUTO_MERGE_ENABLED = "true";
    env.AUTO_MERGE_REQUIRED_CHECKS = "CI";
    env.AUTO_MERGE_REQUIRED_LABEL = "automerge";
    env.AUTO_MERGE_POLICY_PATH = TEST_POLICY_PATH;
    delete env.AUTO_MERGE_CONFIRM_TEMPLATE;
    env.AUDIT_LOG_PATH = TEST_AUDIT_PATH;

    if (fs.existsSync(TEST_AUDIT_PATH)) {
      fs.rmSync(TEST_AUDIT_PATH, { force: true });
    }
    if (fs.existsSync(TEST_POLICY_DIR)) {
      fs.rmSync(TEST_POLICY_DIR, { recursive: true, force: true });
    }
    writePolicy();

    setGuardContext();
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

    if (typeof originalTemplate === "string") env.AUTO_MERGE_CONFIRM_TEMPLATE = originalTemplate;
    else delete env.AUTO_MERGE_CONFIRM_TEMPLATE;

    if (typeof originalAutoMergeEnabled === "string") env.AUTO_MERGE_ENABLED = originalAutoMergeEnabled;
    else delete env.AUTO_MERGE_ENABLED;

    if (typeof originalAutoMergeRequiredLabel === "string") env.AUTO_MERGE_REQUIRED_LABEL = originalAutoMergeRequiredLabel;
    else delete env.AUTO_MERGE_REQUIRED_LABEL;
    if (typeof originalPolicyPath === "string") env.AUTO_MERGE_POLICY_PATH = originalPolicyPath;
    else delete env.AUTO_MERGE_POLICY_PATH;

    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;

    globalThis.fetch = originalFetch;
    if (fs.existsSync(TEST_AUDIT_PATH)) {
      fs.rmSync(TEST_AUDIT_PATH, { force: true });
    }
    if (fs.existsSync(TEST_POLICY_DIR)) {
      fs.rmSync(TEST_POLICY_DIR, { recursive: true, force: true });
    }
  });

  it("rejects draft PR", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr(120, "abcdef1234567890", { draft: true })));

    const result = await mergePullRequestAction({
      prNumber: 120,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 120 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Draft");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects PR when state is not open", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr(121, "abcdef1234567890", { state: "closed" })));

    const result = await mergePullRequestAction({
      prNumber: 121,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 121 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("open");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when expected head sha mismatches", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr(122, "abcdef1234567890")));

    const result = await mergePullRequestAction({
      prNumber: 122,
      expectedHeadSha: "9999999123456789",
      confirmText: "MERGE 122 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("SHA");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when required check is missing", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr(123, "abcdef1234567890")))
      .mockResolvedValueOnce(jsonResponse({ check_runs: [] }))
      .mockResolvedValueOnce(jsonResponse({ contexts: [] }));

    const result = await mergePullRequestAction({
      prNumber: 123,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 123 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("필수 체크");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects when required check conclusion is not success", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr(124, "abcdef1234567890")))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "failure",
            details_url: "https://github.com/example/repo/checks/124",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 124,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 124 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("필수 체크");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects when required check is pending", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr(1241, "abcdef1234567890")))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "queued",
            conclusion: null,
            details_url: "https://github.com/example/repo/checks/1241",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 1241,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 1241 abcdef1",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("필수 체크");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects when confirm text mismatches", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr(125, "abcdef1234567890")))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
            details_url: "https://github.com/example/repo/checks/125",
          },
        ],
      }));

    const result = await mergePullRequestAction({
      prNumber: 125,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 125 WRONG",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("확인 문구");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("merges successfully and appends audit log", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr(126, "abcdef1234567890")))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
            details_url: "https://github.com/example/repo/checks/126",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ merged: true, message: "Pull Request successfully merged", sha: "fedcba9876543210" }));

    const result = await mergePullRequestAction({
      prNumber: 126,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 126 abcdef1",
    });

    expect(result.ok).toBe(true);
    expect(result.merged).toBe(true);
    expect(result.mergeCommitSha).toBe("fedcba9876543210");

    const mergeCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).includes("/pulls/126/merge") && (init?.method ?? "GET") === "PUT";
    });
    expect(mergeCalls).toHaveLength(1);

    const audits = listAudit(20);
    const autoMergeAudit = audits.find((row) => row.event === "AUTO_MERGE");
    expect(autoMergeAudit).toBeTruthy();
    expect(autoMergeAudit?.summary).toContain("성공");
  });

  it("falls back to combined status when check-runs endpoint is unavailable", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr(127, "abcdef1234567890")))
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({
        contexts: [
          {
            context: "CI",
            state: "success",
            target_url: "https://github.com/example/repo/status/127",
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ merged: true, message: "Pull Request successfully merged", sha: "00112233445566" }));

    const result = await mergePullRequestAction({
      prNumber: 127,
      expectedHeadSha: "abcdef1234567890",
      confirmText: "MERGE 127 abcdef1",
    });

    expect(result.ok).toBe(true);
    expect(result.merged).toBe(true);
    const mergeCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).includes("/pulls/127/merge") && (init?.method ?? "GET") === "PUT";
    });
    expect(mergeCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
