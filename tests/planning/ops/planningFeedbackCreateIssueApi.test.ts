import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createIssuePOST } from "../../../src/app/api/ops/feedback/planning/[id]/create-issue/route";
import { createFeedback, getFeedback, updateFeedback } from "../../../src/lib/ops/feedback/planningFeedbackStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalFeedbackDir = process.env.PLANNING_FEEDBACK_DIR;
const originalAuditPath = process.env.AUDIT_LOG_PATH;
const originalGithubToken = process.env.GITHUB_TOKEN;
const originalGithubOwner = process.env.GITHUB_OWNER;
const originalGithubRepo = process.env.GITHUB_REPO;
const originalFetch = globalThis.fetch;

const HOST = "localhost:3000";
const ORIGIN = `http://${HOST}`;
const CSRF = "csrf-token";

function buildRequest(id: string, confirmText: string): Request {
  return new Request(`${ORIGIN}/api/ops/feedback/planning/${encodeURIComponent(id)}/create-issue`, {
    method: "POST",
    headers: {
      host: HOST,
      origin: ORIGIN,
      referer: `${ORIGIN}/ops/feedback/planning`,
      cookie: `dev_action=1; dev_csrf=${encodeURIComponent(CSRF)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      csrf: CSRF,
      confirmText,
    }),
  });
}

async function seedFeedback() {
  return createFeedback({
    from: { screen: "/planning" },
    context: {
      snapshot: {
        id: "snapshot-1",
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        missing: false,
      },
      runId: "run-123",
      reportId: "report-123",
      health: {
        criticalCount: 0,
        warningsCodes: ["WARN_X"],
      },
    },
    content: {
      category: "bug",
      title: "테스트 피드백",
      message: "1. 재현 단계\n2. 결과 확인",
    },
  });
}

async function triageFeedback(id: string) {
  await updateFeedback(id, {
    triage: {
      status: "triaged",
    },
  });
}

describe("planning feedback create-issue api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-feedback-create-issue-"));
    env.NODE_ENV = "test";
    env.PLANNING_FEEDBACK_DIR = path.join(root, "feedback");
    env.AUDIT_LOG_PATH = path.join(root, "audit.json");
    env.GITHUB_TOKEN = "token";
    env.GITHUB_OWNER = "owner";
    env.GITHUB_REPO = "repo";
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalFeedbackDir === "string") env.PLANNING_FEEDBACK_DIR = originalFeedbackDir;
    else delete env.PLANNING_FEEDBACK_DIR;

    if (typeof originalAuditPath === "string") env.AUDIT_LOG_PATH = originalAuditPath;
    else delete env.AUDIT_LOG_PATH;

    if (typeof originalGithubToken === "string") env.GITHUB_TOKEN = originalGithubToken;
    else delete env.GITHUB_TOKEN;

    if (typeof originalGithubOwner === "string") env.GITHUB_OWNER = originalGithubOwner;
    else delete env.GITHUB_OWNER;

    if (typeof originalGithubRepo === "string") env.GITHUB_REPO = originalGithubRepo;
    else delete env.GITHUB_REPO;

    globalThis.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns 400 when confirm text mismatches", async () => {
    const feedback = await seedFeedback();

    const response = await createIssuePOST(
      buildRequest(feedback.id, "WRONG_CONFIRM"),
      { params: Promise.resolve({ id: feedback.id }) },
    );
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: { code?: string; message?: string };
      meta?: { expectedConfirm?: string };
    };

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("CONFIRM_MISMATCH");
    expect(payload.meta?.expectedConfirm).toBe(`CREATE_ISSUE ${feedback.id}`);
  });

  it("creates github issue and stores linked issue metadata", async () => {
    const feedback = await seedFeedback();
    await triageFeedback(feedback.id);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      number: 987,
      html_url: "https://github.com/owner/repo/issues/987",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await createIssuePOST(
      buildRequest(feedback.id, `CREATE_ISSUE ${feedback.id}`),
      { params: Promise.resolve({ id: feedback.id }) },
    );
    const payload = (await response.json()) as {
      ok?: boolean;
      data?: { link?: { githubIssue?: { number?: number; url?: string; createdAt?: string } } };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.link?.githubIssue?.number).toBe(987);
    expect(payload.data?.link?.githubIssue?.url).toBe("https://github.com/owner/repo/issues/987");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(((fetchMock.mock.calls as unknown) as Array<[RequestInfo | URL, RequestInit?]>)[0]?.[0] ?? "")).toContain("/issues");

    const stored = await getFeedback(feedback.id);
    expect(stored?.link?.githubIssue?.number).toBe(987);
    expect(stored?.link?.githubIssue?.url).toBe("https://github.com/owner/repo/issues/987");
    expect(stored?.link?.githubIssue?.createdAt).toBeTruthy();
  });

  it("rejects when feedback already has a linked github issue", async () => {
    const feedback = await seedFeedback();
    await triageFeedback(feedback.id);
    await updateFeedback(feedback.id, {
      link: {
        githubIssue: {
          number: 123,
          url: "https://github.com/owner/repo/issues/123",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      },
    });

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await createIssuePOST(
      buildRequest(feedback.id, `CREATE_ISSUE ${feedback.id}`),
      { params: Promise.resolve({ id: feedback.id }) },
    );
    const payload = (await response.json()) as { ok?: boolean; error?: { code?: string } };

    expect(response.status).toBe(409);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("ALREADY_LINKED");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
