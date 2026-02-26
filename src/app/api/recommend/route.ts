import { prisma } from "@/lib/db/prisma";
import { ensureProductBest } from "@/lib/finlife/best";
import { type NormalizedProduct } from "@/lib/finlife/types";
import { jsonError, jsonOk } from "@/lib/http/apiResponse";
import { pushTiming, timingsToDebugMap, type TimingEntry, withTiming } from "../../../lib/http/timing";
import { applyDepositProtectionPolicy } from "@/lib/recommend/depositProtection";
import { parseKdbRateAndTerm } from "@/lib/recommend/external/kdb";
import { recommendCandidates, type RecommendCandidate } from "@/lib/recommend/score";
import { toNormalizedOption } from "@/lib/recommend/selectOption";
import {
  type CandidatePool,
  type DepositProtectionMode,
  type UserRecommendProfile,
} from "@/lib/recommend/types";
import { createValidationBag, parseIntValue } from "../../../lib/http/validate";
import { issuesToApi, parseRecommendProfile } from "../../../lib/schemas/recommendProfile";
import { parseStringIssues } from "../../../lib/schemas/issueTypes";
import { unifiedProductsToRecommendCandidates } from "../../../lib/recommend/unifiedAdapter";
import { getUnifiedProducts } from "@/lib/sources/unified";

const KDB_CANDIDATE_LIMIT = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function parseKdbTermToSaveTrm(termMonths: number | null): string | undefined {
  if (termMonths === null || !Number.isFinite(termMonths) || termMonths <= 0) return undefined;
  return String(Math.trunc(termMonths));
}

async function loadLegacyFinlifeCandidates(kind: "deposit" | "saving") {
  const unified = await getUnifiedProducts({
    kind,
    includeSources: ["finlife"],
    sourceId: "finlife",
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

  const finPrdtCds = [...new Set(unified.items.map((item) => item.externalKey).filter(Boolean))];
  if (finPrdtCds.length === 0) {
    return {
      candidates: [] as Array<{ sourceId: "finlife"; productId: number; finPrdtCd: string; product: NormalizedProduct; extraReasons: string[]; badges: string[] }>,
      productIdToFinPrdtCd: new Map<number, string>(),
    };
  }

  const rows = await prisma.product.findMany({
    where: {
      kind,
      finPrdtCd: { in: finPrdtCds },
    },
    select: {
      id: true,
      finPrdtCd: true,
      name: true,
      raw: true,
      provider: { select: { name: true } },
      options: {
        select: {
          saveTrm: true,
          intrRate: true,
          intrRate2: true,
          raw: true,
        },
      },
    },
  });

  const productIdToFinPrdtCd = new Map<number, string>();
  const candidates = rows.map((row) => {
    productIdToFinPrdtCd.set(row.id, row.finPrdtCd);
    const raw = (row.raw as Record<string, unknown> | null) ?? {};
    const product = {
      fin_prdt_cd: row.finPrdtCd,
      fin_prdt_nm: typeof raw.fin_prdt_nm === "string" ? raw.fin_prdt_nm : (row.name ?? row.finPrdtCd),
      kor_co_nm: typeof raw.kor_co_nm === "string" ? raw.kor_co_nm : (row.provider?.name ?? ""),
      options: row.options.map((option) => toNormalizedOption({
        saveTrm: option.saveTrm,
        intrRate: option.intrRate,
        intrRate2: option.intrRate2,
        raw: asRecord(option.raw),
      })),
      raw,
    };
    ensureProductBest(product);

    return {
      sourceId: "finlife" as const,
      productId: row.id,
      finPrdtCd: row.finPrdtCd,
      product,
      extraReasons: [] as string[],
      badges: ["FINLIFE"],
    };
  });

  return { candidates, productIdToFinPrdtCd };
}

async function loadKdbCandidates(kind: "deposit" | "saving") {
  const rows = await prisma.externalProduct.findMany({
    where: {
      sourceId: "datago_kdb",
      kind,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: KDB_CANDIDATE_LIMIT,
    select: {
      externalKey: true,
      providerNameRaw: true,
      productNameRaw: true,
      rawJson: true,
    },
  });

  return rows
    .map((row) => {
      const raw = asRecord(row.rawJson) ?? {};
      const parsed = parseKdbRateAndTerm({
        hitIrtCndCone: typeof raw.hitIrtCndCone === "string" ? raw.hitIrtCndCone : undefined,
        prdJinTrmCone: typeof raw.prdJinTrmCone === "string" ? raw.prdJinTrmCone : undefined,
      });
      if (parsed.options.length === 0) return null;

      const options = parsed.options
        .filter((opt) => typeof opt.ratePct === "number" && Number.isFinite(opt.ratePct))
        .map((opt) => toNormalizedOption({
          saveTrm: parseKdbTermToSaveTrm(opt.termMonths),
          intrRate: opt.ratePct,
          intrRate2: opt.ratePct,
          raw: {
            source: "datago_kdb",
            evidence: opt.evidence,
          },
        }));
      if (options.length === 0) return null;

      const product = {
        fin_prdt_cd: `KDB:${row.externalKey}`,
        fin_prdt_nm: row.productNameRaw || "KDB 상품",
        kor_co_nm: row.providerNameRaw || "한국산업은행(KDB)",
        options,
        raw,
      };
      ensureProductBest(product);

      return {
        sourceId: "datago_kdb" as const,
        product,
        extraReasons: [
          "KDB 금리/기간은 원문 문자열 파싱 결과(가정 포함)입니다.",
          ...parsed.notes,
        ],
        badges: ["KDB"],
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

async function loadUnifiedCandidates(input: {
  kind: "deposit" | "saving";
  profile: UserRecommendProfile;
}): Promise<{ candidates: RecommendCandidate[]; matchedFinPrdtCdSet: Set<string> }> {
  const sourceSet = new Set(input.profile.candidateSources ?? ["finlife"]);
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
  candidatePool: CandidatePool;
}): Promise<{ candidates: RecommendCandidate[]; matchedFinPrdtCdSet: Set<string> }> {
  if (input.candidatePool === "unified") {
    return loadUnifiedCandidates({
      kind: input.kind,
      profile: input.profile,
    });
  }

  const includeFinlife = (input.profile.candidateSources ?? ["finlife"]).includes("finlife");
  const includeKdb = (input.profile.candidateSources ?? ["finlife"]).includes("datago_kdb");

  const finlifeLoaded = includeFinlife
    ? await loadLegacyFinlifeCandidates(input.kind)
    : { candidates: [] as Array<{ sourceId: "finlife"; productId: number; finPrdtCd: string; product: NormalizedProduct; extraReasons: string[]; badges: string[] }>, productIdToFinPrdtCd: new Map<number, string>() };
  const kdbCandidates = includeKdb ? await loadKdbCandidates(input.kind) : [];

  return {
    candidates: [
      ...finlifeLoaded.candidates.map((row) => ({
        sourceId: row.sourceId,
        product: row.product,
        extraReasons: row.extraReasons,
        badges: row.badges,
      })),
      ...kdbCandidates,
    ],
    matchedFinPrdtCdSet: new Set<string>(),
  };
}

export async function POST(request: Request) {
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
      return jsonError("INPUT", `입력값 오류 ${issues.length}건: ${summary}`, {
        issues: issuesToApi(issues),
      });
    }
    const profile: UserRecommendProfile = parsedProfile.value;

    const candidatePool = profile.candidatePool ?? "legacy";
    const candidateResult = await withTiming("recommend.loadCandidates", () => getCandidates({
      kind: profile.kind,
      profile,
      candidatePool,
    }));
    pushTiming(timings, candidateResult.timing);
    const candidateBundle = candidateResult.value;

    if (candidateBundle.candidates.length === 0) {
      return jsonOk({
        meta: {
          kind: profile.kind,
          topN: profile.topN,
          rateMode: profile.rateMode,
          candidatePool,
          candidateSources: profile.candidateSources ?? ["finlife"],
          depositProtection: profile.depositProtection ?? "any",
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
      });
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

    return jsonOk({
      meta: {
        kind: profile.kind,
        topN: profile.topN,
        rateMode: profile.rateMode,
        candidatePool,
        candidateSources: profile.candidateSources ?? ["finlife"],
        depositProtection: protectionMode,
        weights: recommendedBase.weights,
        assumptions: {
          ...recommendedBase.assumptions,
          kdbParsingPolicy: "KDB 금리/기간은 원문 문자열 파싱과 휴리스틱 가정(기간별 동일금리 가정 가능)에 기반합니다.",
          depositProtectionPolicy: "보호 신호 필터(any/prefer/require)는 현재 비활성화 상태입니다.",
        },
        fallback: {
          mode: "LIVE",
          sourceKey: "recommend",
          reason: "compute_success",
        },
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
    });
  } catch (error) {
    console.error("[recommend] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("INTERNAL", "추천 데이터를 계산하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}
