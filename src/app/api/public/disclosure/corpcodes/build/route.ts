import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getCorpIndexStatus, invalidateCorpIndexCache, resolveCorpCodesIndexPath } from "@/lib/publicApis/dart/corpIndex";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const MAX_TAIL_LENGTH = 2_000;

type BuildResult = { ok: true; stdout: string; stderr: string } | { ok: false; message: string; stdout: string; stderr: string };

type ExecFileFailure = Error & { code?: string; stdout?: string; stderr?: string };

export async function POST(request: Request) {
  const nodeEnv = (process.env.NODE_ENV ?? "development").trim();
  if (nodeEnv === "production") {
    const expected = (process.env.DART_INDEX_BUILD_TOKEN ?? "").trim();
    const provided = (request.headers.get("x-build-token") ?? "").trim();
    if (!expected || expected !== provided) {
      return NextResponse.json(
        {
          ok: false,
          message: "빌드 권한이 없습니다.",
        },
        { status: 403 },
      );
    }
  }

  const start = Date.now();
  const outPath = resolveCorpCodesIndexPath().primary;
  const scriptPath = path.join(process.cwd(), "scripts", "dart_corpcode_build.py");

  const built = await runBuild(scriptPath, outPath);
  const tookMs = Date.now() - start;

  if (!built.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: built.message,
        stdoutTail: sanitizeTail(built.stdout),
        stderrTail: sanitizeTail(built.stderr),
      },
      { status: 500 },
    );
  }

  invalidateCorpIndexCache();
  return NextResponse.json({
    ok: true,
    outPath,
    tookMs,
    status: getCorpIndexStatus(),
  });
}

async function runBuild(scriptPath: string, outPath: string): Promise<BuildResult> {
  try {
    const result = await execFileAsync("python3", [scriptPath, "--out", outPath], {
      cwd: process.cwd(),
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error) {
    const failure = error as ExecFileFailure;
    if (failure.code === "ENOENT") {
      return {
        ok: false,
        message: "python3를 찾을 수 없습니다.",
        stdout: "",
        stderr: "python3 executable not found",
      };
    }

    return {
      ok: false,
      message: "corpCodes 인덱스 생성에 실패했습니다.",
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
}

function sanitizeTail(input: string): string {
  const masked = input
    .replace(/crtfc_key=[^&\s]+/gi, "crtfc_key=***")
    .replace(/opendart_api_key\s*=\s*[^\s]+/gi, "OPENDART_API_KEY=***")
    .trim();

  if (masked.length <= MAX_TAIL_LENGTH) return masked;
  return masked.slice(-MAX_TAIL_LENGTH);
}
