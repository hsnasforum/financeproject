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

type RepairStep = {
  name: string;
  status: "ok" | "failed" | "skipped";
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
};

type RepairBody = {
  confirm?: unknown;
  csrf?: unknown;
} | null;

const STEPS: Array<{
  name: string;
  command: "pnpm";
  args: string[];
  timeoutMs: number;
}> = [
  { name: "prisma db push", command: "pnpm", args: ["prisma", "db", "push"], timeoutMs: 120_000 },
  { name: "seed:debug", command: "pnpm", args: ["seed:debug"], timeoutMs: 120_000 },
  { name: "data:doctor", command: "pnpm", args: ["data:doctor"], timeoutMs: 120_000 },
  { name: "dart:watch", command: "pnpm", args: ["dart:watch"], timeoutMs: 120_000 },
];

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: RepairBody = null;
  try {
    body = (await request.json()) as RepairBody;
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
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }

  if (body?.confirm !== "RESET") {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_CONFIRM", message: "confirm은 RESET 이어야 합니다." } },
      { status: 400 },
    );
  }

  const steps: RepairStep[] = [];
  let failed = false;

  for (const step of STEPS) {
    if (failed) {
      steps.push({
        name: step.name,
        status: "skipped",
        tookMs: 0,
        stdoutTail: "",
        stderrTail: "이전 단계 실패로 건너뜀",
      });
      continue;
    }

    const result = await runScript({
      command: step.command,
      args: step.args,
      timeoutMs: step.timeoutMs,
    });

    steps.push({
      name: step.name,
      status: result.ok ? "ok" : "failed",
      tookMs: result.tookMs,
      stdoutTail: result.stdoutTail,
      stderrTail: result.error
        ? `${result.stderrTail}\n${result.error.code}: ${result.error.message}`.trim()
        : result.stderrTail,
    });

    if (!result.ok) {
      failed = true;
    }
  }

  return NextResponse.json({
    ok: !failed,
    steps,
  });
}
