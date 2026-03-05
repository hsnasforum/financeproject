import { spawn } from "node:child_process";
import { ALLOWED_FIX_MAP, isAllowedFixId, type AllowedFixId } from "./fixCatalog";

if (typeof window !== "undefined") {
  throw new Error("runScript is server-only.");
}

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
  command: "pnpm" | "node";
  args: string[];
};
export { ALLOWED_FIX_MAP, isAllowedFixId };
export type { AllowedFixId };

export const ALLOWED_RULE_ACTION_MAP = {
  EVAL_ALL: { command: "pnpm", args: ["dart:rules:eval:all"] },
  EVAL_LABELED: { command: "pnpm", args: ["dart:rules:eval:labeled"] },
  SUGGEST: { command: "pnpm", args: ["dart:rules:suggest"] },
  PATCH_MAKE: { command: "pnpm", args: ["dart:rules:patch:make"] },
  PATCH_DRY: { command: "pnpm", args: ["dart:rules:patch:dry"] },
  PATCH_APPLY: { command: "pnpm", args: ["dart:rules:patch:apply"] },
  GATE: { command: "pnpm", args: ["dart:rules:gate"] },
  PR_PREPARE_RULES: { command: "node", args: ["scripts/rules_pr_prepare.mjs", "--scope=both"] },
} as const;

export type AllowedRuleAction = keyof typeof ALLOWED_RULE_ACTION_MAP;

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
  if (command === "pnpm") {
    if (args.length === 1) {
      const script = args[0];
      if (
        script === "seed:debug"
        || script === "dart:watch"
        || script === "news:refresh"
        || script === "data:doctor"
        || script === "daily:refresh"
        || script === "dart:rules:eval:all"
        || script === "dart:rules:eval:labeled"
        || script === "dart:rules:suggest"
        || script === "dart:rules:patch:make"
        || script === "dart:rules:patch:dry"
        || script === "dart:rules:patch:apply"
        || script === "dart:rules:gate"
      ) {
        return { command: "pnpm", args: [script] };
      }
    }

    if (args.length === 3 && args[0] === "prisma" && args[1] === "db" && args[2] === "push") {
      return { command: "pnpm", args: ["prisma", "db", "push"] };
    }
    return null;
  }

  if (command === "node") {
    if (args[0] !== "scripts/rules_pr_prepare.mjs") return null;
    const flags = new Set(args.slice(1));
    if (flags.size !== args.length - 1) return null;

    let hasScope = false;
    for (const token of flags) {
      if (token === "--scope=rules" || token === "--scope=labels" || token === "--scope=both") {
        hasScope = true;
        continue;
      }
      if (token === "--includeTmpPatch=0" || token === "--includeTmpPatch=1") {
        continue;
      }
      return null;
    }
    if (!hasScope) return null;
    return { command: "node", args: [...args] };
  }

  return null;
}

export function isAllowedRuleAction(value: string): value is AllowedRuleAction {
  return Object.prototype.hasOwnProperty.call(ALLOWED_RULE_ACTION_MAP, value);
}

export async function runAllowedFix(
  fixId: string,
  options?: { timeoutMs?: number; cwd?: string },
): Promise<RunScriptResult> {
  const normalized = String(fixId ?? "").trim();
  if (!isAllowedFixId(normalized)) {
    return {
      ok: false,
      tookMs: 0,
      stdoutTail: "",
      stderrTail: "",
      error: {
        code: "NOT_ALLOWED",
        message: `허용되지 않은 fixId 입니다: ${normalized || "(empty)"}`,
      },
    };
  }
  const target = ALLOWED_FIX_MAP[normalized];
  return runScript({
    command: target.command,
    args: [...target.args],
    timeoutMs: options?.timeoutMs,
    cwd: options?.cwd,
  });
}

export async function runAllowedRuleAction(
  action: string,
  options?: { timeoutMs?: number; cwd?: string },
): Promise<RunScriptResult> {
  const normalized = String(action ?? "").trim();
  if (!isAllowedRuleAction(normalized)) {
    return {
      ok: false,
      tookMs: 0,
      stdoutTail: "",
      stderrTail: "",
      error: {
        code: "NOT_ALLOWED",
        message: `허용되지 않은 action 입니다: ${normalized || "(empty)"}`,
      },
    };
  }
  const target = ALLOWED_RULE_ACTION_MAP[normalized];
  return runScript({
    command: target.command,
    args: [...target.args],
    timeoutMs: options?.timeoutMs,
    cwd: options?.cwd,
  });
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
