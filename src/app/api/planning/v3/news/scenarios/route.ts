import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { readExposureProfile } from "@/lib/planning/v3/exposure/store";
import { type IndicatorGrade } from "@/lib/planning/v3/financeNews/contracts";
import { computeImpact } from "@/lib/planning/v3/financeNews/impactModel";
import { readLatestDraftSummaryForStress, readNewsScenarioPack, type NewsScenarioPack } from "@/lib/planning/v3/news/scenarios";
import { runStress } from "@/lib/planning/v3/financeNews/stressRunner";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

const ScenariosResponseSchema = z.object({
  ok: z.literal(true),
  data: z.unknown().nullable(),
});

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractSeriesId(expression: string): string | null {
  const match = expression.match(/[a-zA-Z]+\(([^,\)]+)[,\)]/);
  if (!match) return null;
  const seriesId = asString(match[1]).toLowerCase();
  return seriesId || null;
}

function inferGradeFromTriggerExpression(input: {
  expression: string;
  status: "met" | "not_met" | "unknown";
}): IndicatorGrade {
  const expression = input.expression.toLowerCase();
  if (input.status === "unknown") return "unknown";

  if (expression.includes(">= high")) return input.status === "met" ? "high" : "low";
  if (expression.includes(">= mid")) return input.status === "met" ? "up" : "flat";
  if (expression.includes("< mid")) return input.status === "met" ? "low" : "high";
  if (expression.includes("> 0")) return input.status === "met" ? "up" : "down";
  if (expression.includes("< 0")) return input.status === "met" ? "down" : "up";
  if (expression.includes("regime")) {
    if (expression.includes("= up")) return input.status === "met" ? "up" : "flat";
    if (expression.includes("= down")) return input.status === "met" ? "down" : "flat";
  }
  return input.status === "met" ? "up" : "unknown";
}

function indicatorGradesFromScenario(scenario: NewsScenarioPack["scenarios"][number]): Record<string, IndicatorGrade> {
  const out: Record<string, IndicatorGrade> = {};
  for (const detail of scenario.triggerDetails ?? []) {
    const seriesId = extractSeriesId(asString(detail.expression));
    if (!seriesId) continue;
    out[seriesId] = inferGradeFromTriggerExpression({
      expression: asString(detail.expression),
      status: detail.status,
    });
  }
  return out;
}

async function enrichScenarioPack(pack: NewsScenarioPack | null): Promise<NewsScenarioPack | null> {
  if (!pack) return null;
  const exposure = readExposureProfile();
  let latestDraftSummary = null;
  try {
    latestDraftSummary = await readLatestDraftSummaryForStress();
  } catch {
    latestDraftSummary = null;
  }
  const linkedTopics = [...new Set([
    ...(pack.input.topTopicIds ?? []),
    ...(pack.input.risingTopicIds ?? []),
  ].map((row) => asString(row).toLowerCase()).filter(Boolean))].slice(0, 5);

  return {
    ...pack,
    scenarios: pack.scenarios.map((scenario) => {
      const withLinkedTopics = {
        ...scenario,
        linkedTopics: scenario.linkedTopics && scenario.linkedTopics.length > 0
          ? scenario.linkedTopics
          : linkedTopics,
      };
      const personalImpact = computeImpact({
        profile: exposure,
        scenario: {
          name: withLinkedTopics.name,
          triggerStatus: withLinkedTopics.triggerStatus,
          linkedTopics: withLinkedTopics.linkedTopics ?? [],
          confirmIndicators: withLinkedTopics.confirmIndicators ?? [],
          leadingIndicators: withLinkedTopics.leadingIndicators ?? [],
          observation: withLinkedTopics.observation,
          triggerSummary: withLinkedTopics.triggerSummary,
        },
        indicatorGrades: indicatorGradesFromScenario(scenario),
      });
      const stressResult = runStress({
        profile: exposure,
        impact: personalImpact,
        draftSummary: latestDraftSummary,
      });
      return {
        ...withLinkedTopics,
        personalImpact,
        stress: {
          pressureAreas: stressResult.pressureAreas,
          resilienceNotes: stressResult.resilienceNotes,
          monitoringCadence: stressResult.monitoringOptions,
        },
      };
    }),
  };
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const data = await enrichScenarioPack(readNewsScenarioPack());
  const payload = parseWithV3Whitelist(ScenariosResponseSchema, { ok: true, data }, {
    scope: "response",
    context: "api.v3.news.scenarios",
  });
  return NextResponse.json(payload);
}
