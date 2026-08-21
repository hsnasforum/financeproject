import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RecommendResultsPanel } from "../src/components/recommend/RecommendResultsPanel";
import {
  attachUnifiedIds,
  buildCardFreshnessMeta,
  buildDetailInitialOption,
  buildDetailProduct,
  buildPlanningContextStrip,
  buildTrustCues,
  readPlanningActionContext,
  type RecommendItem,
  type RecommendResponse,
} from "../src/lib/recommend/recommendResultsViewModel";
import { defaults as recommendProfileDefaults } from "../src/lib/schemas/recommendProfile";
import type { SourceStatusRow } from "../src/lib/sources/types";

const baseItem: RecommendItem = {
  unifiedId: "legacy-id",
  sourceId: "finlife",
  kind: "deposit",
  finPrdtCd: "D001",
  providerName: "테스트은행",
  productName: "테스트예금",
  finalScore: 81.25,
  selectedOption: {
    saveTrm: "12",
    termMonths: 12,
    appliedRate: 3.5,
    baseRate: 3.1,
    maxRate: 3.5,
    rateSource: "intr_rate2",
    reasons: [],
  },
  breakdown: [],
  reasons: ["현재 기간 조건과 맞습니다."],
  signals: { depositProtection: "matched" },
};

const baseMeta: NonNullable<RecommendResponse["meta"]> = {
  kind: "deposit",
  topN: 5,
  rateMode: "max",
  candidatePool: "unified",
  candidateSources: ["finlife"],
  depositProtection: "prefer",
  weights: { rate: 0.5, term: 0.3, liquidity: 0.2 },
  assumptions: {
    rateSelectionPolicy: "최고금리는 우대조건 충족을 가정합니다.",
    liquidityPolicy: "중도해지 조건은 별도 확인합니다.",
    normalizationPolicy: "후보 안에서 점수를 정규화합니다.",
    depositProtectionPolicy: "예금자 보호 신호를 우선 확인합니다.",
  },
};

describe("recommend results view model", () => {
  it("normalizes recommendation item ids without mutating the response", () => {
    const response: RecommendResponse = { ok: true, meta: baseMeta, items: [baseItem] };

    const normalized = attachUnifiedIds(response);

    expect(normalized.items?.[0]?.unifiedId).toBe("finlife:D001");
    expect(response.items?.[0]?.unifiedId).toBe("legacy-id");
  });

  it("builds the planning result strip from the report action context", () => {
    const action = readPlanningActionContext(new URLSearchParams({
      from: "planning-report",
      "planning.actionCode": "BUILD_EMERGENCY_FUND",
    }));
    const result: RecommendResponse = {
      ok: true,
      meta: {
        ...baseMeta,
        planning: {
          runId: "run-1",
          summary: { stage: "EMERGENCY", overallStatus: "SUCCESS" },
        },
        planningLinkage: {
          metricsCount: 4,
          inferenceSource: "planning-summary",
        },
      },
      items: [baseItem],
    };

    expect(buildPlanningContextStrip(null, result, action)).toMatchObject({
      title: "비상금 보강 흐름에서 함께 보는 추천입니다",
      actionLabel: "비상금 보강",
      stageLabel: "비상금 보강 단계",
      sourceLabel: "플래닝 요약 참고",
      overallStatusLabel: "성공",
      runId: "run-1",
    });
  });

  it("combines freshness, fallback, assumption, and trust cues", () => {
    const sourceStatus: SourceStatusRow = {
      sourceId: "finlife",
      kind: "deposit",
      lastSyncedAt: "2026-07-10T00:00:00.000Z",
      ttlMs: 60_000,
      ageMs: 120_000,
      isFresh: false,
      counts: 3,
    };
    const meta: RecommendResponse["meta"] = {
      ...baseMeta,
      fallback: { mode: "mock" },
    };

    expect(buildCardFreshnessMeta({
      item: baseItem,
      meta,
      sourceStatusReady: true,
      sourceStatusRow: sourceStatus,
    })).toMatchObject({
      freshnessStatus: "stale",
      fallbackMode: "예시 데이터 기준",
      assumptionNotes: [
        "최고금리는 우대조건 충족을 가정합니다.",
        "예금자 보호 신호를 우선 확인합니다.",
      ],
    });

    expect(buildTrustCues({
      item: baseItem,
      depositProtectionPolicy: baseMeta.assumptions.depositProtectionPolicy,
    }).map((cue) => cue.label)).toEqual([
      "예금자 보호 신호 확인",
      "우대금리 포함 가능성",
      "데이터 최신성 읽기",
    ]);
  });

  it("keeps detail option order and resolves the recommended option separately", () => {
    const withDetail: RecommendItem = {
      ...baseItem,
      detailProduct: {
        fin_prdt_cd: "D001",
        kor_co_nm: "테스트은행",
        fin_prdt_nm: "테스트예금",
        options: [
          { save_trm: "6", intr_rate: 2.8, intr_rate2: 3, raw: { order: 1 } },
          { save_trm: "12", intr_rate: 3.1, intr_rate2: 3.5, raw: { order: 2 } },
        ],
        raw: { source: "fixture" },
      },
    };

    expect(buildDetailProduct(withDetail).options.map((option) => option.save_trm)).toEqual(["6", "12"]);
    expect(buildDetailInitialOption(withDetail)).toMatchObject({
      save_trm: "12",
      intr_rate: 3.1,
      intr_rate2: 3.5,
    });

    const fallback = buildDetailProduct({
      ...baseItem,
      detailProduct: undefined,
      selectedOption: {
        ...baseItem.selectedOption,
        saveTrm: null,
        termMonths: 24,
        baseRate: null,
      },
    });
    expect(fallback.options[0]).toMatchObject({ save_trm: "24", intr_rate: 3.5, intr_rate2: 3.5 });
  });

  it("does not synthesize a 0% fallback when recommendation rate evidence is missing", () => {
    const fallback = buildDetailProduct({
      ...baseItem,
      detailProduct: undefined,
      selectedOption: {
        ...baseItem.selectedOption,
        appliedRate: 0,
        baseRate: null,
        maxRate: null,
        rateSource: "none",
      },
    });

    expect(fallback.options[0]).toMatchObject({ intr_rate: null, intr_rate2: null });
  });

  it("renders the extracted result panel with the existing action contract", () => {
    const html = renderToStaticMarkup(
      <RecommendResultsPanel
        result={{ ok: true, meta: baseMeta, items: [attachUnifiedIds({ ok: true, items: [baseItem] }).items![0]] }}
        feedback=""
        storedProfile={recommendProfileDefaults()}
        planningActionContext={null}
        sourceStatusRows={[]}
        sourceStatusReady={false}
        openDetailKey={null}
        onOpenDetailKeyChange={vi.fn()}
        onSave={vi.fn()}
        onExportJson={vi.fn()}
        onExportCsv={vi.fn()}
        onAddCompare={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="recommend-results"');
    expect(html).toContain("추천 결과");
    expect(html).toContain("결과 저장");
    expect(html).toContain("상세 분석");
    expect(html).toContain("비교 담기");
    expect(html).toContain("예금자 보호 신호 확인");
  });
});
