import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as eligibilityGet } from "../src/app/api/ops/auto-merge/eligibility/route";
import { defaultAutoMergePolicy } from "../src/lib/ops/autoMergePolicy";

const env = process.env as Record<string, string | undefined>;
const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalGithubToken = process.env.GITHUB_TOKEN;
const originalGithubOwner = process.env.GITHUB_OWNER;
const originalGithubRepo = process.env.GITHUB_REPO;
const originalAutoMergeEnabled = process.env.AUTO_MERGE_ENABLED;
const originalRequiredChecks = process.env.AUTO_MERGE_REQUIRED_CHECKS;
const originalRequiredLabel = process.env.AUTO_MERGE_REQUIRED_LABEL;
const originalConfirmTemplate = process.env.AUTO_MERGE_CONFIRM_TEMPLATE;
const originalMinApprovals = process.env.AUTO_MERGE_MIN_APPROVALS;
const originalRequireClean = process.env.AUTO_MERGE_REQUIRE_CLEAN;
const originalPolicyPath = process.env.AUTO_MERGE_POLICY_PATH;
const TEST_POLICY_DIR = path.join(process.cwd(), "tmp", "tests", "auto-merge-eligibility");
const TEST_POLICY_PATH = path.join(TEST_POLICY_DIR, "policy.json");

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildRequest(query: string): Request {
  const host = "localhost:3000";
  const origin = `http://${host}`;
  const headers = new Headers({
    host,
    origin,
    referer: `${origin}/ops/auto-merge`,
    cookie: "dev_action=1; dev_csrf=csrf-token",
  });
  return new Request(`${origin}/api/ops/auto-merge/eligibility?${query}`, {
    method: "GET",
    headers,
  });
}

function openPr(
  labels: Array<{ name: string }> = [{ name: "automerge" }],
  options: { mergeableState?: string } = {},
) {
  return {
    number: 950,
    state: "open",
    draft: false,
    html_url: "https://github.com/example/repo/pull/950",
    mergeable_state: options.mergeableState ?? "clean",
    labels,
    head: {
      sha: "abcdef1234567890",
      ref: "bot/rules-tune",
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

describe("auto-merge eligibility route", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.GITHUB_TOKEN = "token";
    env.GITHUB_OWNER = "owner";
    env.GITHUB_REPO = "repo";
    env.AUTO_MERGE_ENABLED = "true";
    env.AUTO_MERGE_REQUIRED_CHECKS = "CI";
    env.AUTO_MERGE_REQUIRED_LABEL = "automerge";
    env.AUTO_MERGE_CONFIRM_TEMPLATE = "MERGE {PR} {SHA7}";
    env.AUTO_MERGE_MIN_APPROVALS = "0";
    env.AUTO_MERGE_REQUIRE_CLEAN = "false";
    env.AUTO_MERGE_POLICY_PATH = TEST_POLICY_PATH;
    if (fs.existsSync(TEST_POLICY_DIR)) {
      fs.rmSync(TEST_POLICY_DIR, { recursive: true, force: true });
    }
    writePolicy();
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
    if (typeof originalAutoMergeEnabled === "string") env.AUTO_MERGE_ENABLED = originalAutoMergeEnabled;
    else delete env.AUTO_MERGE_ENABLED;
    if (typeof originalRequiredChecks === "string") env.AUTO_MERGE_REQUIRED_CHECKS = originalRequiredChecks;
    else delete env.AUTO_MERGE_REQUIRED_CHECKS;
    if (typeof originalRequiredLabel === "string") env.AUTO_MERGE_REQUIRED_LABEL = originalRequiredLabel;
    else delete env.AUTO_MERGE_REQUIRED_LABEL;
    if (typeof originalConfirmTemplate === "string") env.AUTO_MERGE_CONFIRM_TEMPLATE = originalConfirmTemplate;
    else delete env.AUTO_MERGE_CONFIRM_TEMPLATE;
    if (typeof originalMinApprovals === "string") env.AUTO_MERGE_MIN_APPROVALS = originalMinApprovals;
    else delete env.AUTO_MERGE_MIN_APPROVALS;
    if (typeof originalRequireClean === "string") env.AUTO_MERGE_REQUIRE_CLEAN = originalRequireClean;
    else delete env.AUTO_MERGE_REQUIRE_CLEAN;
    if (typeof originalPolicyPath === "string") env.AUTO_MERGE_POLICY_PATH = originalPolicyPath;
    else delete env.AUTO_MERGE_POLICY_PATH;
    if (fs.existsSync(TEST_POLICY_DIR)) {
      fs.rmSync(TEST_POLICY_DIR, { recursive: true, force: true });
    }
    globalThis.fetch = originalFetch;
  });

  it("returns DISABLED when AUTO_MERGE_ENABLED is false", async () => {
    env.AUTO_MERGE_ENABLED = "false";
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr()));

    const response = await eligibilityGet(buildRequest("prNumber=950&expectedHeadSha=abcdef1234567890&csrf=csrf-token"));
    const payload = (await response.json()) as { ok?: boolean; eligible?: boolean; reasonCode?: string };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.eligible).toBe(false);
    expect(payload.reasonCode).toBe("DISABLED");
  });

  it("returns LABEL_MISSING when required label is absent", async () => {
    writePolicy({ requiredLabel: "safe-merge" });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(openPr([{ name: "needs-review" }])));

    const response = await eligibilityGet(buildRequest("prNumber=950&expectedHeadSha=abcdef1234567890&csrf=csrf-token"));
    const payload = (await response.json()) as { reasonCode?: string; eligible?: boolean };

    expect(response.status).toBe(200);
    expect(payload.eligible).toBe(false);
    expect(payload.reasonCode).toBe("LABEL_MISSING");
  });

  it("returns CHECKS_PENDING when checks are not completed", async () => {
    writePolicy({ requiredChecks: ["CI"] });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr()))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "queued",
            conclusion: null,
          },
        ],
      }));

    const response = await eligibilityGet(buildRequest("prNumber=950&expectedHeadSha=abcdef1234567890&csrf=csrf-token"));
    const payload = (await response.json()) as { reasonCode?: string; eligible?: boolean };

    expect(response.status).toBe(200);
    expect(payload.eligible).toBe(false);
    expect(payload.reasonCode).toBe("CHECKS_PENDING");
  });

  it("returns eligible=true when checks are successful", async () => {
    writePolicy({ requiredChecks: ["CI"] });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr()))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }));

    const response = await eligibilityGet(buildRequest("prNumber=950&expectedHeadSha=abcdef1234567890&csrf=csrf-token"));
    const payload = (await response.json()) as { reasonCode?: string; eligible?: boolean; ok?: boolean };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.eligible).toBe(true);
    expect(payload.reasonCode).toBe("ELIGIBLE");
  });

  it("returns APPROVALS_MISSING when min approvals requirement is not met", async () => {
    writePolicy({ minApprovals: 1 });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr()))
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

    const response = await eligibilityGet(buildRequest("prNumber=950&expectedHeadSha=abcdef1234567890&csrf=csrf-token"));
    const payload = (await response.json()) as { reasonCode?: string; approvalsCount?: number; approvalsRequired?: number };

    expect(response.status).toBe(200);
    expect(payload.reasonCode).toBe("APPROVALS_MISSING");
    expect(payload.approvalsCount).toBe(0);
    expect(payload.approvalsRequired).toBe(1);
  });

  it("returns MERGE_CONFLICT when require clean is enabled and mergeable_state is dirty", async () => {
    writePolicy({ requireClean: true });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(openPr([{ name: "automerge" }], { mergeableState: "dirty" })))
      .mockResolvedValueOnce(jsonResponse({
        check_runs: [
          {
            name: "CI",
            status: "completed",
            conclusion: "success",
          },
        ],
      }));

    const response = await eligibilityGet(buildRequest("prNumber=950&expectedHeadSha=abcdef1234567890&csrf=csrf-token"));
    const payload = (await response.json()) as { reasonCode?: string; mergeableState?: string };

    expect(response.status).toBe(200);
    expect(payload.reasonCode).toBe("MERGE_CONFLICT");
    expect(payload.mergeableState).toBe("dirty");
  });
});
