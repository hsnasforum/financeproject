import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { decideTrustedOrigin, parseHostPatterns } from "@/lib/security/trustedOrigin";

declare global {
  var __smokeSyncRunning: boolean | undefined;
}

export const runtime = "nodejs";

function isLocalSyncAllowed(): boolean {
  if (process.env.ALLOW_LOCAL_SYNC === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function runSmokeSync(): Promise<{ reportPath: string | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["live:smoke"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk ?? "");
      if (stdout.length > 100_000) stdout = stdout.slice(-100_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
      if (stderr.length > 100_000) stderr = stderr.slice(-100_000);
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("smoke sync command failed"));
        return;
      }
      const combined = `${stdout}\n${stderr}`;
      const match = combined.match(/artifacts\/live-verify-[0-9]{8}-[0-9]{6}\.json/g);
      resolve({ reportPath: match?.[match.length - 1] ?? null });
    });
  });
}

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();

  try {
    const localAllowed = isLocalSyncAllowed();
    if (!localAllowed) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "현재 환경에서는 로컬 스모크 동기화가 비활성화되어 있습니다.",
            hint: "개발 환경에서만 사용하세요. 필요 시 ALLOW_LOCAL_SYNC=1 설정을 확인하세요.",
          },
        },
        { status: 403 },
      );
    }

    const originDecision = decideTrustedOrigin(request.headers, {
      allowMissingOrigin: process.env.ALLOW_LOCAL_SYNC === "1",
      allowLoopbackEquivalence: true,
      trustedOriginHosts: parseHostPatterns(process.env.TRUSTED_ORIGIN_HOSTS),
      trustedForwardHosts: parseHostPatterns(process.env.TRUSTED_FORWARD_HOSTS),
    });
    if (!originDecision.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: originDecision.code,
            message: originDecision.message,
            hint: originDecision.hint,
          },
        },
        { status: 403 },
      );
    }

    if (globalThis.__smokeSyncRunning) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "CONFLICT",
            message: "Smoke sync is already running.",
          },
        },
        { status: 409 },
      );
    }

    globalThis.__smokeSyncRunning = true;
    const result = await runSmokeSync();

    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      reportPath: result.reportPath,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL",
          message: "Smoke sync failed.",
        },
      },
      { status: 500 },
    );
  } finally {
    globalThis.__smokeSyncRunning = false;
  }
}
