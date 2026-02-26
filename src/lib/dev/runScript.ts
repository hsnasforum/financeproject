import { spawn } from "node:child_process";

export type RunScriptErrorCode =
  | "NOT_ALLOWED"
  | "SPAWN_ERROR"
  | "EXIT_NON_ZERO"
  | "TIMEOUT";

export type RunScriptError = {
  code: RunScriptErrorCode;
  message: string;
};

export type RunScriptInput = {
  command: string;
  args: string[];
  timeoutMs?: number;
  cwd?: string;
};

export type RunScriptResult = {
  ok: boolean;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
  error?: RunScriptError;
};

type AllowedCommand = {
  command: "pnpm";
  args: ["dart:watch"] | ["data:doctor"];
};

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TAIL_CHARS = 2_000;

function appendTail(current: string, chunk: string, maxChars = MAX_TAIL_CHARS): string {
  const joined = `${current}${chunk}`;
  if (joined.length <= maxChars) return joined;
  return joined.slice(joined.length - maxChars);
}

export function sanitizeRunScriptInput(input: RunScriptInput): AllowedCommand | null {
  const command = (input.command ?? "").trim();
  const args = Array.isArray(input.args) ? input.args.map((entry) => String(entry).trim()).filter(Boolean) : [];
  if (command !== "pnpm" || args.length !== 1) return null;

  const script = args[0];
  if (script !== "dart:watch" && script !== "data:doctor") return null;
  return { command: "pnpm", args: [script] };
}

export async function runScript(input: RunScriptInput): Promise<RunScriptResult> {
  const allowed = sanitizeRunScriptInput(input);
  if (!allowed) {
    return {
      ok: false,
      tookMs: 0,
      stdoutTail: "",
      stderrTail: "",
      error: {
        code: "NOT_ALLOWED",
        message: "허용되지 않은 스크립트 실행 요청입니다.",
      },
    };
  }

  const timeoutMs = Number.isFinite(input.timeoutMs) && (input.timeoutMs ?? 0) > 0
    ? Math.trunc(input.timeoutMs as number)
    : DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let stdoutTail = "";
    let stderrTail = "";
    let resolved = false;
    let timedOut = false;

    const child = spawn(allowed.command, allowed.args, {
      cwd: input.cwd ?? process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    const done = (result: RunScriptResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutTail = appendTail(stdoutTail, String(chunk));
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrTail = appendTail(stderrTail, String(chunk));
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      done({
        ok: false,
        tookMs: Date.now() - startedAt,
        stdoutTail,
        stderrTail,
        error: {
          code: "SPAWN_ERROR",
          message: error instanceof Error ? error.message : "스크립트 실행 중 오류가 발생했습니다.",
        },
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) {
        done({
          ok: false,
          tookMs: Date.now() - startedAt,
          stdoutTail,
          stderrTail,
          error: {
            code: "TIMEOUT",
            message: `스크립트 실행 시간이 ${timeoutMs}ms를 초과했습니다.`,
          },
        });
        return;
      }

      if (code === 0) {
        done({
          ok: true,
          tookMs: Date.now() - startedAt,
          stdoutTail,
          stderrTail,
        });
        return;
      }

      done({
        ok: false,
        tookMs: Date.now() - startedAt,
        stdoutTail,
        stderrTail,
        error: {
          code: "EXIT_NON_ZERO",
          message: `스크립트가 비정상 종료했습니다 (exit ${code ?? "null"}).`,
        },
      });
    });
  });
}
