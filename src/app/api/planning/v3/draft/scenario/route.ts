import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  type DraftScenarioSimulationInput,
  simulateDraftScenario,
} from "@/lib/planning/v3/draft/service";

type ScenarioBody = DraftScenarioSimulationInput & {
  csrf?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withWriteGuard(request: Request, body: ScenarioBody): Response | null {
  try {
    assertSameOrigin(request);
    requireCsrf(request, { csrf: asString(body?.csrf) }, { allowWhenCookieMissing: true });
    return null;
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
}

export async function POST(request: Request) {
  let body: ScenarioBody = null;
  try {
    body = (await request.json()) as ScenarioBody;
  } catch {
    body = null;
  }

  const guarded = withWriteGuard(request, body);
  if (guarded) return guarded;

  if (!isRecord(body?.draftPatch)) {
    return NextResponse.json(
      { ok: false, error: { code: "INPUT", message: "draftPatch가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const simulated = simulateDraftScenario({
      draftPatch: body.draftPatch,
      scenario: isRecord(body.scenario) ? body.scenario : undefined,
      seed: body.seed,
      volatilityPct: body.volatilityPct,
      periodMonths: body.periodMonths,
      sampleCount: body.sampleCount,
    });

    return NextResponse.json({
      ok: true,
      data: simulated,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "시나리오 시뮬레이션에 실패했습니다." } },
      { status: 500 },
    );
  }
}
