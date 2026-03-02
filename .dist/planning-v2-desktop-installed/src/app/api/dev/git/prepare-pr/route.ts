import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { runScript } from "../../../../../lib/dev/runScript";

const PREPARE_TIMEOUT_MS = 120_000;

type PrepareScope = "rules" | "labels" | "both";

type PreparePrBody = {
  scope?: unknown;
  includeTmpPatch?: unknown;
  csrf?: unknown;
} | null;

function statusFromErrorCode(code: string | undefined): number {
  if (!code) return 500;
  if (code === "NOT_ALLOWED") return 400;
  if (code === "TIMEOUT") return 504;
  return 500;
}

function toScope(value: unknown): PrepareScope | null {
  const scope = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (scope === "rules" || scope === "labels" || scope === "both") return scope;
  return null;
}

function toIncludeTmpPatch(value: unknown): 0 | 1 {
  if (value === true || value === 1 || value === "1") return 1;
  return 0;
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: PreparePrBody = null;
  try {
    body = (await request.json()) as PreparePrBody;
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

  const scope = toScope(body?.scope);
  if (!scope) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_SCOPE", message: "scope는 rules|labels|both 중 하나여야 합니다." },
      },
      { status: 400 },
    );
  }
  const includeTmpPatch = toIncludeTmpPatch(body?.includeTmpPatch);

  const result = await runScript({
    command: "node",
    args: [
      "scripts/rules_pr_prepare.mjs",
      `--scope=${scope}`,
      `--includeTmpPatch=${includeTmpPatch}`,
    ],
    timeoutMs: PREPARE_TIMEOUT_MS,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      tookMs: result.tookMs,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      tookMs: result.tookMs,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
      error: result.error ?? { code: "INTERNAL", message: "PR 준비 실행에 실패했습니다." },
    },
    { status: statusFromErrorCode(result.error?.code) },
  );
}
