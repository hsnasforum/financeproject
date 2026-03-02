import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { listWorkflowRuns } from "../../../../../lib/github/actionsRuns";

type DispatchBody = {
  workflow?: unknown;
  ref?: unknown;
  csrf?: unknown;
} | null;

type GithubErrorPayload = {
  message?: string;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readConfig() {
  const token = asString(process.env.GITHUB_TOKEN_DISPATCH);
  const owner = asString(process.env.GITHUB_REPO_OWNER);
  const repo = asString(process.env.GITHUB_REPO_NAME);
  const missing = [];
  if (!token) missing.push("GITHUB_TOKEN_DISPATCH");
  if (!owner) missing.push("GITHUB_REPO_OWNER");
  if (!repo) missing.push("GITHUB_REPO_NAME");
  return { token, owner, repo, missing };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: DispatchBody = null;
  try {
    body = (await request.json()) as DispatchBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: { code: guard.code, message: guard.message },
      },
      { status: guard.status },
    );
  }

  const workflow = asString(body?.workflow);
  const ref = asString(body?.ref);
  if (!workflow || !ref) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "workflow와 ref가 필요합니다." },
      },
      { status: 400 },
    );
  }

  const config = readConfig();
  if (config.missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "CONFIG", message: `필수 환경변수 누락: ${config.missing.join(", ")}` },
      },
      { status: 500 },
    );
  }

  const endpoint = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const since = new Date().toISOString();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "finance-dev-dispatch",
      },
      body: JSON.stringify({ ref }),
    });

    if (response.status === 204) {
      let runUrl: string | null = null;
      try {
        const runs = await listWorkflowRuns({
          owner: config.owner,
          repo: config.repo,
          workflow,
          ref,
          token: config.token,
          since,
          perPage: 10,
        });
        runUrl = runs.runUrl;
      } catch {
        runUrl = null;
      }

      const pollUrl = runUrl
        ? null
        : `/api/dev/github/runs/latest?workflow=${encodeURIComponent(workflow)}&ref=${encodeURIComponent(ref)}&since=${encodeURIComponent(since)}&csrf=${encodeURIComponent(asString(body?.csrf))}`;

      return NextResponse.json({
        ok: true,
        runUrl,
        pollUrl,
        workflow,
        ref,
        since,
      });
    }

    const payload = (await response.json().catch(() => null)) as GithubErrorPayload;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DISPATCH_FAILED",
          message: payload?.message || `GitHub dispatch failed (status ${response.status}).`,
        },
      },
      { status: 502 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DISPATCH_FAILED",
          message: error instanceof Error ? error.message : "GitHub dispatch 요청에 실패했습니다.",
        },
      },
      { status: 502 },
    );
  }
}
