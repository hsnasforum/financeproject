import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import { getCheckRunsSummary, getPrHeadSha } from "../../../../../../lib/github/checks";

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

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const numberRaw = Number(searchParams.get("number") ?? "");
  const csrf = asString(searchParams.get("csrf"));

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
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

  if (!Number.isFinite(numberRaw) || numberRaw <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "number가 필요합니다." },
      },
      { status: 400 },
    );
  }
  const number = Math.trunc(numberRaw);

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

  try {
    const sha = await getPrHeadSha(config.owner, config.repo, number, config.token);
    if (!sha) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "PR_NOT_FOUND", message: "PR head sha를 찾지 못했습니다." },
        },
        { status: 404 },
      );
    }

    const summary = await getCheckRunsSummary(config.owner, config.repo, sha, config.token);
    return NextResponse.json({
      ok: true,
      number,
      ...summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "CHECKS_FAILED",
          message: error instanceof Error ? error.message : "PR checks 조회에 실패했습니다.",
        },
      },
      { status: 502 },
    );
  }
}
