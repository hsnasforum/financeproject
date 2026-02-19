import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getCorpIndexStatus, invalidateCorpIndexCache, resolveCorpCodesIndexPath } from "@/lib/publicApis/dart/corpIndex";
import { canBuildCorpIndex } from "@/lib/publicApis/dart/indexBuildGuard";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const guard = canBuildCorpIndex({
    requestToken: request.headers.get("x-build-token"),
  });

  if (!guard.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "FORBIDDEN",
        message: "인덱스 자동 생성은 현재 환경에서 허용되지 않습니다.",
        reason: guard.reason,
        status: getCorpIndexStatus(),
      },
      { status: 403 },
    );
  }

  const start = Date.now();
  const { primary: outPath } = resolveCorpCodesIndexPath();
  const scriptPath = path.join(process.cwd(), "scripts", "dart_corpcode_build.py");

  const result = await runBuild(scriptPath, outPath);
  const tookMs = Date.now() - start;

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "BUILD_FAILED",
        message: result.message,
        stderrTail: sanitizeTail(result.stderr),
        status: getCorpIndexStatus(),
      },
      { status: 500 },
    );
  }

  invalidateCorpIndexCache();
  const status = getCorpIndexStatus();
  if (!status.exists) {
    return NextResponse.json(
      {
        ok: false,
        error: "INDEX_NOT_FOUND_AFTER_BUILD",
        message: "인덱스 생성 후 파일을 찾지 못했습니다. 출력 경로와 권한을 확인하세요.",
        outPath,
        stdoutTail: sanitizeTail(result.stdout),
        status,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    outPath,
    tookMs,
    stdoutTail: sanitizeTail(result.stdout),
    status,
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED", message: "POST 요청을 사용하세요." }, { status: 405 });
}

async function runBuild(scriptPath: string, outPath: string): Promise<{ ok: true; stdout: string } | { ok: false; message: string; stderr: string }> {
  const args = [scriptPath, "--out", outPath];

  try {
    const first = await execFileAsync("python3", args, {
      cwd: process.cwd(),
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: first.stdout ?? "" };
  } catch (error) {
    const firstErr = error as Error & { code?: string; stderr?: string };
    if (firstErr.code !== "ENOENT") {
      return {
        ok: false,
        message: mapBuildFailureMessage(firstErr.stderr ?? firstErr.message ?? "인덱스 생성에 실패했습니다."),
        stderr: firstErr.stderr ?? String(firstErr.message ?? ""),
      };
    }
  }

  try {
    const second = await execFileAsync("python", args, {
      cwd: process.cwd(),
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: second.stdout ?? "" };
  } catch (error) {
    const secondErr = error as Error & { code?: string; stderr?: string };
    if (secondErr.code === "ENOENT") {
      return {
        ok: false,
        message: "python 실행 환경을 찾지 못했습니다. python3 또는 python 설치를 확인하세요.",
        stderr: "python executable not found",
      };
    }

    return {
      ok: false,
      message: mapBuildFailureMessage(secondErr.stderr ?? secondErr.message ?? "인덱스 생성에 실패했습니다."),
      stderr: secondErr.stderr ?? String(secondErr.message ?? ""),
    };
  }
}

function mapBuildFailureMessage(stderr: string): string {
  const safe = stderr.toLowerCase();
  if (safe.includes("opendart_api_key")) {
    return "OPENDART_API_KEY 설정이 필요합니다.";
  }
  if (safe.includes("timed out")) {
    return "인덱스 생성이 시간 초과되었습니다. 잠시 후 다시 시도하세요.";
  }
  if (safe.includes("http status") || safe.includes("호출 실패")) {
    return "OpenDART 호출에 실패했습니다. 네트워크 상태를 확인하고 다시 시도하세요.";
  }
  return "인덱스 생성에 실패했습니다. 서버 로그를 확인하세요.";
}

function sanitizeTail(text: string): string {
  const redacted = text
    .replace(/crtfc_key=[^&\s]+/gi, "crtfc_key=***")
    .replace(/opendart_api_key\s*=\s*[^\s]+/gi, "OPENDART_API_KEY=***");

  const trimmed = redacted.trim();
  if (trimmed.length <= 1200) return trimmed;
  return trimmed.slice(-1200);
}
