import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ensureProductBest } from "@/lib/finlife/best";
import { type NormalizedProduct } from "@/lib/finlife/types";
import { applyDepositProtectionPolicy } from "@/lib/recommend/depositProtection";
import { parseKdbRateAndTerm } from "@/lib/recommend/external/kdb";
import { recommendCandidates } from "@/lib/recommend/score";
import { toNormalizedOption } from "@/lib/recommend/selectOption";
import {
  DEFAULT_TOP_N,
  DEFAULT_WEIGHTS,
  type CandidateSource,
  type DepositProtectionMode,
  type UserRecommendProfile,
} from "@/lib/recommend/types";
import { getUnifiedProducts } from "@/lib/sources/unified";

const KDB_CANDIDATE_LIMIT = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function asEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function asInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function asWeight(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function asPreferredTerm(value: unknown, fallback: UserRecommendProfile["preferredTerm"]): UserRecommendProfile["preferredTerm"] {
  const n = asInt(value, fallback, 3, 36);
  if (n === 3 || n === 6 || n === 12 || n === 24 || n === 36) return n;
  return fallback;
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isValidPreferredTerm(value: unknown): boolean {
  const n = Number(value);
  return n === 3 || n === 6 || n === 12 || n === 24 || n === 36;
}

function parseCandidateSources(value: unknown): CandidateSource[] {
  if (!Array.isArray(value)) return ["finlife"];
  const picked = new Set<CandidateSource>();
  for (const raw of value) {
    if (raw === "finlife" || raw === "datago_kdb") picked.add(raw);
  }
  return picked.size > 0 ? [...picked] : ["finlife"];
}

function parseProfile(rawBody: unknown, queryTopN: string | null): { profile: UserRecommendProfile; issues: string[] } {
  const body = isObject(rawBody) ? rawBody : {};
  const weightsRaw = isObject(body.weights) ? body.weights : {};
  const issues: string[] = [];

  if (body.purpose !== undefined && !isOneOf(body.purpose, ["emergency", "seed-money", "long-term"] as const)) {
    issues.push("purpose must be one of emergency|seed-money|long-term");
  }
  if (body.kind !== undefined && !isOneOf(body.kind, ["deposit", "saving"] as const)) {
    issues.push("kind must be deposit or saving");
  }
  if (body.liquidityPref !== undefined && !isOneOf(body.liquidityPref, ["low", "mid", "high"] as const)) {
    issues.push("liquidityPref must be low|mid|high");
  }
  if (body.rateMode !== undefined && !isOneOf(body.rateMode, ["max", "base", "simple"] as const)) {
    issues.push("rateMode must be max|base|simple");
  }
  if (body.preferredTerm !== undefined && !isValidPreferredTerm(body.preferredTerm)) {
    issues.push("preferredTerm must be one of 3|6|12|24|36");
  }
  if (body.depositProtection !== undefined && !isOneOf(body.depositProtection, ["any", "prefer", "require"] as const)) {
    issues.push("depositProtection must be any|prefer|require");
  }

  const candidateSources = parseCandidateSources(body.candidateSources);
  if (body.candidateSources !== undefined && candidateSources.length === 0) {
    issues.push("candidateSources must include finlife or datago_kdb");
  }

  if (body.topN !== undefined) {
    const n = Number(body.topN);
    if (!Number.isFinite(n) || Math.trunc(n) < 1 || Math.trunc(n) > 50) {
      issues.push("topN must be an integer between 1 and 50");
    }
  }
  if (queryTopN !== null) {
    const n = Number(queryTopN);
    if (!Number.isFinite(n) || Math.trunc(n) < 1 || Math.trunc(n) > 50) {
      issues.push("query topN must be an integer between 1 and 50");
    }
  }

  const profile: UserRecommendProfile = {
    purpose: asEnum(body.purpose, ["emergency", "seed-money", "long-term"] as const, "seed-money"),
    kind: asEnum(body.kind, ["deposit", "saving"] as const, "deposit"),
    preferredTerm: asPreferredTerm(body.preferredTerm, 12),
    liquidityPref: asEnum(body.liquidityPref, ["low", "mid", "high"] as const, "mid"),
    rateMode: asEnum(body.rateMode, ["max", "base", "simple"] as const, "max"),
    topN: asInt(queryTopN ?? body.topN, DEFAULT_TOP_N, 1, 50),
    candidateSources,
    depositProtection: asEnum(body.depositProtection, ["any", "prefer", "require"] as const, "any"),
    weights: {
      rate: asWeight(weightsRaw.rate, DEFAULT_WEIGHTS.rate),
      term: asWeight(weightsRaw.term, DEFAULT_WEIGHTS.term),
      liquidity: asWeight(weightsRaw.liquidity, DEFAULT_WEIGHTS.liquidity),
    },
  };

  if (isObject(weightsRaw)) {
    for (const [key, value] of Object.entries(weightsRaw)) {
      if (key !== "rate" && key !== "term" && key !== "liquidity") continue;
      if (value === undefined) continue;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        issues.push(`weights.${key} must be between 0 and 1`);
      }
    }
  }

  return { profile, issues };
}

function parseKdbTermToSaveTrm(termMonths: number | null): string | undefined {
  if (termMonths === null || !Number.isFinite(termMonths) || termMonths <= 0) return undefined;
  return String(Math.trunc(termMonths));
}

async function loadFinlifeCandidates(kind: "deposit" | "saving") {
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

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const { profile, issues } = parseProfile(await request.json().catch(() => ({})), url.searchParams.get("topN"));
    if (issues.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INPUT",
            message: issues.join("; "),
          },
        },
        { status: 400 },
      );
    }

    const includeFinlife = (profile.candidateSources ?? ["finlife"]).includes("finlife");
    const includeKdb = (profile.candidateSources ?? ["finlife"]).includes("datago_kdb");

    const finlifeLoaded = includeFinlife
      ? await loadFinlifeCandidates(profile.kind)
      : { candidates: [], productIdToFinPrdtCd: new Map<number, string>() };
    const kdbCandidates = includeKdb ? await loadKdbCandidates(profile.kind) : [];

    if (finlifeLoaded.candidates.length === 0 && kdbCandidates.length === 0) {
      return NextResponse.json({
        ok: true,
        meta: {
          kind: profile.kind,
          topN: profile.topN,
          rateMode: profile.rateMode,
          candidateSources: profile.candidateSources ?? ["finlife"],
          depositProtection: profile.depositProtection ?? "any",
          weights: profile.weights,
          assumptions: {
            rateSelectionPolicy: "금리 선택 정책: 최고금리 우선(기본값)",
            liquidityPolicy: "유동성은 기간 기반 휴리스틱으로 반영",
            normalizationPolicy: "금리 점수는 후보군 내 0..1 정규화",
            kdbParsingPolicy: "KDB 문자열 파싱 결과(가정 포함)는 옵션 확장 시에만 사용",
          },
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

    const recommendedBase = recommendCandidates({
      kind: profile.kind,
      profile,
      candidates: [
        ...finlifeLoaded.candidates.map((row) => ({
          sourceId: row.sourceId,
          product: row.product,
          extraReasons: row.extraReasons,
          badges: row.badges,
        })),
        ...kdbCandidates,
      ],
    });

    const protectionMode = (profile.depositProtection ?? "any") as DepositProtectionMode;
    const itemsWithProtection = applyDepositProtectionPolicy({
      items: recommendedBase.items,
      mode: protectionMode,
      matchedFinPrdtCdSet: new Set(),
    })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, Math.max(1, Math.min(50, profile.topN)));

    return NextResponse.json({
      ok: true,
      meta: {
        kind: profile.kind,
        topN: profile.topN,
        rateMode: profile.rateMode,
        candidateSources: profile.candidateSources ?? ["finlife"],
        depositProtection: protectionMode,
        weights: recommendedBase.weights,
        assumptions: {
          ...recommendedBase.assumptions,
          kdbParsingPolicy: "KDB 금리/기간은 원문 문자열 파싱과 휴리스틱 가정(기간별 동일금리 가정 가능)에 기반합니다.",
          depositProtectionPolicy: "보호 신호 필터(any/prefer/require)는 현재 비활성화 상태입니다.",
        },
      },
      items: itemsWithProtection,
      debug: recommendedBase.debug,
    });
  } catch (error) {
    console.error("[recommend] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RECOMMEND_FAILED",
          message: "추천 데이터를 계산하지 못했습니다. 잠시 후 다시 시도해주세요.",
        },
      },
      { status: 500 },
    );
  }
}
