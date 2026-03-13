import { jsonError, jsonOk, statusFromCode } from "@/lib/http/apiResponse";
import { pushTiming, timingsToDebugMap, type TimingEntry, withTiming } from "../../../lib/http/timing";
import { applyDepositProtectionPolicy } from "@/lib/recommend/depositProtection";
import { recommendCandidates, type RecommendCandidate } from "@/lib/recommend/score";
import {
  type DepositProtectionMode,
  type UserRecommendProfile,
} from "@/lib/recommend/types";
import { createValidationBag, parseIntValue } from "../../../lib/http/validate";
import { issuesToApi, parseRecommendProfile } from "../../../lib/schemas/recommendProfile";
import { parseStringIssues } from "../../../lib/schemas/issueTypes";
import { unifiedProductsToRecommendCandidates } from "../../../lib/recommend/unifiedAdapter";
import { getUnifiedProducts } from "@/lib/sources/unified";
import { pushError } from "../../../lib/observability/errorRingBuffer";
import { attachTrace, getOrCreateTraceId, setTraceHeader } from "../../../lib/observability/trace";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildPlanningLinkageMeta(planningContext: UserRecommendProfile["planningContext"]) {
  const metrics = [
    planningContext?.monthlyIncomeKrw,
    planningContext?.monthlyExpenseKrw,
    planningContext?.liquidAssetsKrw,
    planningContext?.debtBalanceKrw,
  ];
  const metricsCount = metrics.filter((value) => typeof value === "number" && Number.isFinite(value)).length;

  return {
    readiness: metricsCount === 0 ? "none" : metricsCount === metrics.length ? "ready" : "partial",
    metricsCount,
    stageInference: "disabled" as const,
  };
}

async function loadUnifiedCandidates(input: {
  kind: "deposit" | "saving";
  profile: UserRecommendProfile;
}): Promise<{ candidates: RecommendCandidate[]; matchedFinPrdtCdSet: Set<string> }> {
  const sourceSet = new Set(input.profile.candidateSources ?? ["finlife", "datago_kdb"]);
  if (sourceSet.size === 0) sourceSet.add("finlife");

  const includeSources: Array<"finlife" | "datago_kdb"> = [];
  if (sourceSet.has("finlife")) includeSources.push("finlife");
  if (sourceSet.has("datago_kdb")) includeSources.push("datago_kdb");
  if (includeSources.length === 0) includeSources.push("finlife");

  const unified = await getUnifiedProducts({
    kind: input.kind,
    mode: "merged",
    includeSources,
    sourceId: null,
    cursor: null,
    q: null,
    refresh: false,
    onlyNew: false,
    changedSince: null,
    includeTimestamps: false,
    limit: 1000,
    sort: "name",
    qMode: "contains",
  });

  const adapted = unifiedProductsToRecommendCandidates({
    items: unified.items,
    profile: {
      preferredTerm: input.profile.preferredTerm,
      rateMode: input.profile.rateMode,
    },
  });

  return {
    candidates: adapted.map((candidate) => ({
      sourceId: candidate.sourceId,
      product: candidate.product,
      badges: candidate.badges,
      extraReasons: candidate.extraReasons,
    })),
    matchedFinPrdtCdSet: new Set(
      adapted
        .filter((candidate) => candidate.matchedDepositProtection)
        .map((candidate) => candidate.product.fin_prdt_cd),
    ),
  };
}

async function getCandidates(input: {
  kind: "deposit" | "saving";
  profile: UserRecommendProfile;
}): Promise<{ candidates: RecommendCandidate[]; matchedFinPrdtCdSet: Set<string> }> {
  return loadUnifiedCandidates({
    kind: input.kind,
    profile: input.profile,
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const traceId = getOrCreateTraceId(request);
  const traceMeta = (meta: unknown = {}) => attachTrace(meta, traceId);
  const withTrace = <T extends Response>(response: T) => setTraceHeader(response, traceId);
  const recordError = (code: string, message: string, status: number) => {
    pushError({
      time: new Date().toISOString(),
      traceId,
      route: "/api/recommend",
      source: "recommend",
      code,
      message,
      status,
      elapsedMs: Date.now() - startedAt,
    });
  };

  try {
    const url = new URL(request.url);
    const debugTimingsEnabled = url.searchParams.get("debug") === "1";
    const timings: TimingEntry[] = [];
    const body = await request.json().catch(() => ({}));
    const topNBag = createValidationBag();
    const queryTopNRaw = url.searchParams.get("topN");
    const queryTopN = queryTopNRaw === null
      ? null
      : parseIntValue(topNBag, {
          path: "query.topN",
          value: queryTopNRaw,
          fallback: 10,
          min: 1,
          max: 50,
        });

    const profileInput: Record<string, unknown> = isObject(body) ? { ...body } : {};
    if (queryTopN !== null) profileInput.topN = queryTopN;

    const parsedProfile = parseRecommendProfile(profileInput);
    const issues = [...parsedProfile.issues, ...parseStringIssues(topNBag.issues)];
    if (issues.length > 0) {
      const first = issues[0];
      const summary = first ? `${first.path} ${first.message}` : "입력값이 올바르지 않습니다.";
      const message = `입력값 오류 ${issues.length}건: ${summary}`;
      const status = statusFromCode("INPUT");
      recordError("INPUT", message, status);
      return withTrace(jsonError("INPUT", message, {
        issues: issuesToApi(issues),
        meta: traceMeta(),
      }));
    }
    const profile: UserRecommendProfile = parsedProfile.value;
    const planningLinkage = buildPlanningLinkageMeta(profile.planningContext);

    const candidatePool = profile.candidatePool ?? "unified";
    const candidateResult = await withTiming("recommend.loadCandidates", () => getCandidates({
      kind: profile.kind,
      profile,
    }));
    pushTiming(timings, candidateResult.timing);
    const candidateBundle = candidateResult.value;

    if (candidateBundle.candidates.length === 0) {
      return withTrace(jsonOk({
        meta: {
          ...traceMeta({
            kind: profile.kind,
            topN: profile.topN,
            rateMode: profile.rateMode,
            candidatePool,
            candidateSources: profile.candidateSources ?? ["finlife", "datago_kdb"],
            depositProtection: profile.depositProtection ?? "any",
            planningContext: profile.planningContext ?? null,
            planningLinkage,
            weights: profile.weights,
            assumptions: {
              rateSelectionPolicy: "금리 선택 정책: 최고금리 우선(기본값)",
              liquidityPolicy: "유동성은 기간 기반 휴리스틱으로 반영",
              normalizationPolicy: "금리 점수는 후보군 내 0..1 정규화",
              kdbParsingPolicy: "KDB 문자열 파싱 결과(가정 포함)는 옵션 확장 시에만 사용",
            },
            fallback: {
              mode: "LIVE",
              sourceKey: "recommend",
              reason: "compute_no_candidates",
            },
          }),
          ...(debugTimingsEnabled
            ? {
                debug: {
                  timings: timingsToDebugMap(timings),
                },
              }
            : {}),
        },
        items: [],
        message: "No products in DB. Run pnpm live:smoke or pnpm products:sync",
        debug: {
          candidateCount: 0,
          rateMin: 0,
          rateMax: 0,
        },
      }));
    }

    const recommendResult = await withTiming("recommend.score", async () => recommendCandidates({
      kind: profile.kind,
      profile,
      candidates: candidateBundle.candidates,
    }));
    pushTiming(timings, recommendResult.timing);
    const recommendedBase = recommendResult.value;

    const protectionMode = (profile.depositProtection ?? "any") as DepositProtectionMode;
    const itemsWithProtection = applyDepositProtectionPolicy({
      items: recommendedBase.items,
      mode: protectionMode,
      matchedFinPrdtCdSet: candidateBundle.matchedFinPrdtCdSet,
    })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, Math.max(1, Math.min(50, profile.topN)));

    return withTrace(jsonOk({
      meta: {
        ...traceMeta({
          kind: profile.kind,
          topN: profile.topN,
          rateMode: profile.rateMode,
          candidatePool,
          candidateSources: profile.candidateSources ?? ["finlife", "datago_kdb"],
          depositProtection: protectionMode,
          planningContext: profile.planningContext ?? null,
          planningLinkage,
          weights: recommendedBase.weights,
          assumptions: {
            ...recommendedBase.assumptions,
            kdbParsingPolicy: "KDB 금리/기간은 원문 문자열 파싱과 휴리스틱 가정(기간별 동일금리 가정 가능)에 기반합니다.",
            depositProtectionPolicy: "prefer는 보호 신호 상품에 가산점을 주고, require는 보호 신호 상품만 남깁니다.",
          },
          fallback: {
            mode: "LIVE",
            sourceKey: "recommend",
            reason: "compute_success",
          },
        }),
        ...(debugTimingsEnabled
          ? {
              debug: {
                timings: timingsToDebugMap(timings),
              },
            }
          : {}),
      },
      items: itemsWithProtection,
      debug: recommendedBase.debug,
    }));
  } catch (error) {
    console.error("[recommend] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    const message = "추천 데이터를 계산하지 못했습니다. 잠시 후 다시 시도해주세요.";
    const status = statusFromCode("INTERNAL");
    recordError("INTERNAL", message, status);
    return withTrace(jsonError("INTERNAL", message, { meta: traceMeta() }));
  }
}
