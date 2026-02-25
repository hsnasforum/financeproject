import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { decideTrustedOrigin, parseHostPatterns } from "@/lib/security/trustedOrigin";

export const runtime = "nodejs";

type GitAction = "status" | "pull" | "push";

type GitCommandResult = {
  ok: boolean;
  action: GitAction;
  command: string;
  code: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  ranAt: string;
  durationMs: number;
};

const MAX_OUTPUT_CHARS = 12000;
const COMMAND_TIMEOUT_MS = 120000;

function isDevEnabled(): boolean {
  return (process.env.NODE_ENV ?? "development") !== "production";
}

function sanitizeGitOutput(text: string): string {
  if (!text) return "";
  return text
    .replace(/(https?:\/\/[^/\s:@]+:)([^@\s]+)(@)/gi, "$1****$3")
    .replace(/(ghp_[A-Za-z0-9_]+)/g, "ghp_****");
}

function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated]`;
}

function resolveGitArgs(action: GitAction): string[] {
  if (action === "status") return ["status", "--short", "--branch"];
  if (action === "pull") return ["pull", "--ff-only"];
  return ["push"];
}

async function runGit(action: GitAction): Promise<GitCommandResult> {
  const args = resolveGitArgs(action);
  const started = Date.now();
  const ranAt = new Date(started).toISOString();

  return await new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk ?? "");
      if (stdout.length > MAX_OUTPUT_CHARS * 2) stdout = stdout.slice(-MAX_OUTPUT_CHARS * 2);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
      if (stderr.length > MAX_OUTPUT_CHARS * 2) stderr = stderr.slice(-MAX_OUTPUT_CHARS * 2);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      const durationMs = Math.max(0, Date.now() - started);
      resolve({
        ok: false,
        action,
        command: `git ${args.join(" ")}`,
        code: null,
        timedOut,
        stdout: "",
        stderr: sanitizeGitOutput(String(error instanceof Error ? error.message : error)),
        ranAt,
        durationMs,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Math.max(0, Date.now() - started);
      const safeStdout = truncateOutput(sanitizeGitOutput(stdout.trim()));
      const safeStderr = truncateOutput(sanitizeGitOutput(stderr.trim()));
      resolve({
        ok: code === 0 && !timedOut,
        action,
        command: `git ${args.join(" ")}`,
        code,
        timedOut,
        stdout: safeStdout,
        stderr: safeStderr,
        ranAt,
        durationMs,
      });
    });
  });
}

function isValidAction(value: unknown): value is GitAction {
  return value === "status" || value === "pull" || value === "push";
}

function enforceTrustedOrigin(request: Request) {
  return decideTrustedOrigin(request.headers, {
    allowMissingOrigin: false,
    allowLoopbackEquivalence: true,
    trustedOriginHosts: parseHostPatterns(process.env.TRUSTED_ORIGIN_HOSTS),
    trustedForwardHosts: parseHostPatterns(process.env.TRUSTED_FORWARD_HOSTS),
  });
}

export async function GET(request: Request) {
  if (!isDevEnabled()) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }
  const decision = enforceTrustedOrigin(request);
  if (!decision.ok) {
    return NextResponse.json({ ok: false, error: { code: decision.code, message: decision.message, hint: decision.hint } }, { status: 403 });
  }

  const result = await runGit("status");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  if (!isDevEnabled()) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }
  const decision = enforceTrustedOrigin(request);
  if (!decision.ok) {
    return NextResponse.json({ ok: false, error: { code: decision.code, message: decision.message, hint: decision.hint } }, { status: 403 });
  }

  let action: GitAction | null = null;
  try {
    const body = await request.json() as { action?: unknown };
    action = isValidAction(body?.action) ? body.action : null;
  } catch {
    action = null;
  }

  if (!action) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "action은 status|pull|push 중 하나여야 합니다." } },
      { status: 400 },
    );
  }

  const result = await runGit(action);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

